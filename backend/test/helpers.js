import { createApp } from '../src/app.js';

export async function boot(overrides = {}) {
  process.env.NODE_ENV = 'test';
  const app = createApp({ otp: { resendCooldownMs: 0, maxSendsPerHour: 1000 }, limits: { authPerMin: 10000, globalPerMin: 100000 }, superAdminPhone: '+919000000000', ...overrides });
  await app.ready;
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (method, path, { body, token, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  };
  const login = async (phone, client = 'customer_app') => {
    const s = await call('POST', '/v1/auth/otp/send', { body: { phone, client } });
    const v = await call('POST', '/v1/auth/otp/verify', { body: { phone, client, otp: s.json.devOtp } });
    return v;
  };
  const wsUrl = base.replace('http', 'ws') + '/v1/ws';
  return { app, base, call, login, wsUrl, close: () => app.close() };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function wsOpen(url, headers) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const msgs = [];
    ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
    ws.onopen = () => resolve({ ws, msgs });
    ws.onerror = (e) => reject(e);
  });
}
export async function waitFor(fn, ms = 1500) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(20); }
  return fn();
}
export const ADDR = { label: 'Home', line1: '12 Park Street, Flat 3B', pincode: '700016' };
export async function onboard(t, phone, name = 'Asha Roy') {
  const v = await t.login(phone);
  const setup = await t.call('PUT', '/v1/me/setup', { token: v.json.accessToken, body: { name, address: ADDR } });
  return { token: v.json.accessToken, refresh: v.json.refreshToken, user: v.json.user, setup };
}
