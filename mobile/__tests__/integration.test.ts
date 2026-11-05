// Runs the real mobile ApiClient + Realtime against the real backend, proving the contract matches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, ApiError, type TokenStore } from '../src/core/api';
import { Realtime } from '../src/core/realtime';
import type { Tokens } from '../src/core/types';
// @ts-ignore - plain JS backend
import { createApp } from '../../backend/src/app.js';

const memStore = (): TokenStore & { value: Tokens | null } => ({ value: null, async load() { return this.value; }, async save(t) { this.value = t; } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => any, ms = 2000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return fn(); await sleep(15); } return fn(); }

test('customer API does not activate a session when secure token persistence fails', async () => {
  const api = new ApiClient({
    baseUrl: 'http://127.0.0.1:4000',
    store: { async load() { return null; }, async save() { throw new Error('secure storage unavailable'); } },
  });
  await assert.rejects(() => api.setTokens({ accessToken: 'access', refreshToken: 'refresh' }), /secure storage unavailable/);
  assert.equal(api.accessToken, null);
});

test('mobile client <-> backend contract', async (t) => {
  process.env.NODE_ENV = 'test';
  const app = createApp({ otp: { resendCooldownMs: 0, maxSendsPerHour: 1000 }, limits: { authPerMin: 10000, globalPerMin: 100000 }, superAdminPhone: '+919000000000' });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const port = app.server.address().port;
  t.after(() => app.close());
  const base = `http://127.0.0.1:${port}`;
  let authLost = 0;
  const store = memStore();
  const api = new ApiClient({ baseUrl: base, store, onAuthLost: () => authLost++ });

  await t.test('signup -> setup -> bonus', async () => {
    const s = await api.sendOtp('9830055555');
    assert.match(s.devOtp!, /^\d{6}$/);
    await assert.rejects(() => api.verifyOtp('9830055555', '000000' === s.devOtp ? '111111' : '000000'), (e: any) => e instanceof ApiError && e.code === 'invalid_otp');
    const v = await api.verifyOtp('9830055555', s.devOtp!);
    assert.equal(v.needsSetup, true);
    assert.ok(store.value?.refreshToken);
    const setup = await api.completeSetup({ name: 'Asha Roy', address: { label: 'Home', line1: '12 Park Street', landmark: '', pincode: '700016' }, prefs: { pushEnabled: true } });
    assert.equal(setup.bonusGranted, 50);
    assert.equal((await api.me()).wallet.balance, 50);
  });
  await t.test('validation errors surface as ApiError with code', async () => {
    await assert.rejects(() => api.sendOtp('123'), (e: any) => e.status === 422 && e.code === 'validation_error');
  });
  await t.test('expired access token => single-flight refresh, request retried transparently', async () => {
    const old = store.value!;
    await api.setTokens({ ...old, accessToken: old.accessToken.slice(0, -4) + 'AAAA' }); // corrupt signature
    const [a, b, c] = await Promise.all([api.me(), api.wallet(), api.notifications()]);
    assert.ok(a.user && b.balance === 50 && c.items.length >= 1);
    assert.notEqual(store.value!.refreshToken, old.refreshToken, 'rotated exactly once');
    assert.equal(app.store.refresh.size, 2, 'only one refresh happened (login + 1 rotation)');
  });
  await t.test('revoked session => onAuthLost fires and tokens cleared', async () => {
    for (const s of app.store.sessions.values()) s.revoked = true;
    await assert.rejects(() => api.me(), (e: any) => e.status === 401);
    assert.equal(authLost, 1);
    assert.equal(store.value, null);
  });
  await t.test('products: ETag revalidation returns cached data on 304', async () => {
    const a = await api.products();
    const b = await api.products();
    assert.deepEqual(a, b);
    assert.ok(a.items.length > 10 && a.categories.includes('Vegetables'));
  });
  await t.test('order flow end-to-end with coins + realtime feed', async () => {
    const s = await api.sendOtp('9830066666');
    await api.verifyOtp('9830066666', s.devOtp!);
    const setup = await api.completeSetup({ name: 'Bani Sen', address: { label: 'Home', line1: '5 Lake Road', landmark: 'Near park', pincode: '700029' }, prefs: { pushEnabled: true } });
    const { items } = await api.products();
    const pot = items.find((p) => p.sku === 'VEG-POT')!;
    const q = await api.quote([{ productId: pot.id, qty: 11 }], 100);
    assert.equal(q.deliveryFee, 0);
    assert.equal(q.coinsUsed, 30);
    const key = `k-${Date.now()}-abcdefgh`;
    const placed = await api.placeOrder({ items: [{ productId: pot.id, qty: 11 }], addressId: setup.addresses[0].id, useCoins: q.coinsUsed }, key);
    const replay = await api.placeOrder({ items: [{ productId: pot.id, qty: 11 }], addressId: setup.addresses[0].id, useCoins: q.coinsUsed }, key);
    assert.equal(placed.order.id, replay.order.id);
    assert.equal(placed.wallet.balance, 20);
    assert.equal((await api.orders()).items.length, 1);

    const prices: any[] = [];
    const notifs: any[] = [];
    const rt = new Realtime({ url: base.replace('http', 'ws') + '/v1/ws', getToken: () => api.accessToken, onPrices: (i) => prices.push(...i), onNotification: (n) => notifs.push(n) });
    rt.start();
    await sleep(150);
    const admin = app.store.userByPhone('+919000000000');
    const adminToken = app.tokens.startSession(admin, 'admin_app').accessToken;
    const call = (m: string, p: string, body: any) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` }, body: JSON.stringify(body) });
    await call('PATCH', `/v1/admin/products/${pot.id}`, { price: 31 });
    assert.ok(await until(() => prices.find((p) => p.id === pot.id && p.price === 31)), 'live price pushed to client');
    await call('PATCH', `/v1/admin/orders/${placed.order.id}/status`, { status: 'confirmed' });
    assert.ok(await until(() => notifs.find((n) => n.data?.orderId === placed.order.id)), 'order notification pushed to client');
    rt.stop();
    const c = await api.cancelOrder(placed.order.id);
    assert.equal(c.order.status, 'cancelled');
    assert.equal(c.wallet.balance, 50);
  });
  await t.test('network failure maps to ApiError(isNetwork) and GET retries once', async () => {
    let n = 0;
    const flaky = new ApiClient({ baseUrl: base, store: memStore(), fetchImpl: (async (...a: any[]) => { if (n++ === 0) throw new TypeError('fetch failed'); return fetch(a[0], a[1]); }) as any });
    assert.ok((await flaky.products()).items.length > 0);
    const dead = new ApiClient({ baseUrl: 'http://127.0.0.1:1', store: memStore(), timeoutMs: 800 });
    await assert.rejects(() => dead.sendOtp('9830012345'), (e: any) => e instanceof ApiError && e.isNetwork);
  });
  await t.test('Realtime reconnects with backoff after server drop', async () => {
    let opens = 0, reconnects = 0;
    const rt = new Realtime({ url: base.replace('http', 'ws') + '/v1/ws', getToken: () => null, onPrices: () => {}, onNotification: () => {}, onStatus: (s) => { if (s === 'open') opens++; }, onReconnect: () => reconnects++, maxBackoffMs: 100 });
    rt.start();
    await until(() => opens === 1);
    for (const c of [...app.ws.conns]) c.socket.destroy(); // simulate network drop on server side
    await until(() => opens >= 2, 4000);
    assert.ok(opens >= 2 && reconnects >= 1, `opens=${opens} reconnects=${reconnects}`);
    rt.stop();
  });
});
