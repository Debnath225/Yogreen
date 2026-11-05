// Runs the real RiderApi + RiderRealtime against the real backend (contract test for the rider app).
import test from 'node:test';
import assert from 'node:assert/strict';
import { RiderApi } from '../src/core/riderApi';
import { ApiError, type TokenStore } from '../src/core/baseApi';
import { RiderRealtime } from '../src/core/realtime';
import { Realtime } from '../../mobile/src/core/realtime';
import type { RiderEvent, Tokens } from '../src/core/types';
// @ts-ignore - plain JS backend
import { createApp } from '../../backend/src/app.js';

const memStore = (): TokenStore & { value: Tokens | null } => ({ value: null, async load() { return this.value; }, async save(t) { this.value = t; } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => T, ms = 2000): Promise<T> { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(15); } return fn(); }

test('network errors explain backend reachability instead of claiming internet is unavailable', async () => {
  const api = new RiderApi({
    baseUrl: 'http://127.0.0.1:4000',
    store: memStore(),
    fetchImpl: async () => { throw new TypeError('Network request failed'); },
  });
  await assert.rejects(
    () => api.sendOtp('9870000001'),
    (error: unknown) => error instanceof ApiError
      && error.isNetwork
      && error.message.includes('Could not reach the YoGreen server'),
  );
});

test('rider API does not activate a session when secure token persistence fails', async () => {
  const api = new RiderApi({
    baseUrl: 'http://127.0.0.1:4000',
    store: { async load() { return null; }, async save() { throw new Error('secure storage unavailable'); } },
  });
  await assert.rejects(() => api.setTokens({ accessToken: 'access', refreshToken: 'refresh' }), /secure storage unavailable/);
  assert.equal(api.accessToken, null);
});

test('rider client <-> backend contract', async (t) => {
  process.env.NODE_ENV = 'test';
  const app = createApp({ otp: { resendCooldownMs: 0, maxSendsPerHour: 1000 }, limits: { authPerMin: 10000, globalPerMin: 100000 }, superAdminPhone: '+919000000000' });
  await app.ready;
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => app.close());
  const adminToken = (await app.tokens.startSession(app.store.userByPhone('+919000000000'), 'admin_app')).accessToken;
  const admin = (m: string, p: string, body?: any) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json() }));
  await admin('POST', '/v1/admin/staff', { phone: '9870000001', role: 'rider', name: 'Ravi Das' });

  // a customer with a packed order waiting
  const cust = new RiderApi({ baseUrl: base, store: memStore() }); // generic client, used only to make a customer session
  const cs = await app.tokens.startSession(app.store.addUser({ phone: '+919871000001', role: 'customer', name: 'Asha Roy', setupCompleted: true, addresses: [{ id: 'a1', label: 'Home', line1: '12 Park Street', landmark: 'Near mall', pincode: '700016' }] }), 'customer_app');
  const place = async () => {
    const pot = [...app.store.products.values()].find((p: any) => p.sku === 'VEG-POT');
    const r = await fetch(base + '/v1/orders', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cs.accessToken}`, 'idempotency-key': `k-${Date.now()}-${Math.random().toString(36).slice(2)}` }, body: JSON.stringify({ items: [{ productId: pot.id, qty: 11 }], addressId: 'a1' }) });
    const o = (await r.json()).order;
    await admin('PATCH', `/v1/admin/orders/${o.id}/status`, { status: 'confirmed' });
    await admin('PATCH', `/v1/admin/orders/${o.id}/status`, { status: 'packed' });
    return o;
  };

  const store = memStore();
  const api = new RiderApi({ baseUrl: base, store });

  await t.test('customer number cannot log into the rider app; unknown number gets no OTP', async () => {
    const s = await api.sendOtp('9871000001'); // a registered customer's number
    assert.equal(s.devOtp, undefined, 'no OTP is sent to non-rider numbers on the rider app');
    await assert.rejects(() => api.verifyOtp('9871000001', '123456'), (e: any) => e instanceof ApiError && e.status === 401);
  });
  await t.test('rider login via OTP (client=rider_app)', async () => {
    const s = await api.sendOtp('9870000001');
    assert.match(s.devOtp!, /^\d{6}$/);
    const a = await api.verifyOtp('9870000001', s.devOtp!);
    assert.equal(a.user.role, 'rider');
    const me = await api.me();
    assert.equal(me.rider.name, 'Ravi Das');
    assert.equal(me.online, false);
    const none = await api.sendOtp('9870000099');
    assert.equal(none.devOtp, undefined, 'unregistered rider number is never sent an OTP');
  });
  await t.test('unregistered number can never complete rider login', async () => {
    await assert.rejects(() => api.verifyOtp('9870000099', '123456'), (e: any) => e instanceof ApiError && e.status === 401);
  });

  let events: RiderEvent[] = [];
  let rt: RiderRealtime;
  let customerRealtime: Realtime | null = null;
  const locations: ({ latitude: number; longitude: number; updatedAt: number } | null)[] = [];
  const trackingStatuses: string[] = [];
  t.after(() => customerRealtime?.stop());
  await t.test('go online + live order_available event', async () => {
    rt = new RiderRealtime({ url: base.replace('http', 'ws') + '/v1/ws', getToken: () => api.accessToken, onEvent: (e) => events.push(e) });
    rt.start();
    await sleep(150);
    assert.equal((await api.setOnline(true)).online, true);
    const o = await place();
    const ev = await until(() => events.find((e) => e.type === 'order_available'));
    assert.ok(ev && ev.type === 'order_available' && ev.order.id === o.id);
    assert.equal((ev as any).order.customer, undefined, 'no customer details before accepting');
    const list = await api.tasks('available');
    assert.equal(list.items.length, 1);
    (t as any).orderId = o.id;
  });
  await t.test('claim -> pickup -> deliver with PIN -> earnings', async () => {
    const id = (t as any).orderId;
    const claimed = await api.claim(id);
    assert.equal(claimed.order.customer?.name, 'Asha Roy');
    assert.equal(claimed.order.address?.line1, '12 Park Street');
    assert.equal((await api.tasks('active')).items.length, 1);
    await assert.rejects(() => api.deliver(id, '1234'), (e: any) => e.code === 'invalid_transition');
    assert.equal((await api.pickup(id)).order.status, 'out_for_delivery');
    customerRealtime = new Realtime({
      url: base.replace('http', 'ws') + '/v1/ws',
      getToken: () => cs.accessToken,
      onPrices: () => undefined,
      onNotification: () => undefined,
    });
    customerRealtime.start();
    customerRealtime.subscribeOrder(id, (location) => locations.push(location), (status) => trackingStatuses.push(status));
    await until(() => trackingStatuses.find((status) => status === 'out_for_delivery'));
    rt.publishLocation(id, { latitude: 22.573, longitude: 88.364 });
    const liveLocation = await until(() => locations.find((location) => location?.latitude === 22.573));
    assert.equal(liveLocation?.longitude, 88.364);
    const pin = app.store.orders.get(id).deliveryCode;
    await assert.rejects(() => api.deliver(id, pin === '0000' ? '1111' : '0000'), (e: any) => e.code === 'wrong_code');
    const done = await api.deliver(id, pin);
    assert.equal(done.order.status, 'delivered');
    assert.equal(done.today.earnings, 30);
    const earn = await api.earnings();
    assert.equal(earn.items[0].number, done.order.number);
    assert.ok(earn.cashHeld > 0);
    assert.equal((await api.tasks('done')).items.length, 1);
  });
  await t.test('second rider session sees "taken" event when another rider claims', async () => {
    events.length = 0;
    const o = await place();
    await until(() => events.find((e) => e.type === 'order_available'));
    await admin('POST', '/v1/admin/staff', { phone: '9870000002', role: 'rider', name: 'Sunil Paul' });
    const api2 = new RiderApi({ baseUrl: base, store: memStore() });
    const s2 = await api2.sendOtp('9870000002');
    await api2.verifyOtp('9870000002', s2.devOtp!);
    await api2.setOnline(true);
    await api2.claim(o.id);
    const taken = await until(() => events.find((e) => e.type === 'order_taken' && e.orderId === o.id));
    assert.ok(taken, 'first rider is told the order is gone');
    await assert.rejects(() => api.claim(o.id), (e: any) => e.code === 'order_unavailable');
    rt.stop();
  });
  await t.test('expired access token is refreshed transparently', async () => {
    const old = store.value!;
    await api.setTokens({ ...old, accessToken: old.accessToken.slice(0, -4) + 'AAAA' });
    const [a, b] = await Promise.all([api.me(), api.earnings()]);
    assert.ok(a.rider && b.items.length >= 1);
    assert.notEqual(store.value!.refreshToken, old.refreshToken);
  });
  await t.test('logout ends the session', async () => {
    await api.logout();
    assert.equal(store.value, null);
  });
});
