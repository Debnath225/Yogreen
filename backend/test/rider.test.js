import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboard, wsOpen, waitFor } from './helpers.js';

const pid = (s, sku) => [...s.app.store.products.values()].find((p) => p.sku === sku).id;
let n = 0;
async function placeOrder(s, cust, qty = 11) {
  const aid = (await s.call('GET', '/v1/me/addresses', { token: cust.token })).json.items[0].id;
  const r = await s.call('POST', '/v1/orders', { token: cust.token, headers: { 'idempotency-key': `rider-key-${Date.now()}-${n++}` }, body: { items: [{ productId: pid(s, 'VEG-POT'), qty }], addressId: aid } });
  assert.equal(r.status, 201);
  return r.json.order;
}
const advance = (s, at, id, status) => s.call('PATCH', `/v1/admin/orders/${id}/status`, { token: at, body: { status } });

test('rider app: dispatch, proof of delivery, earnings, cash', async (t) => {
  const s = await boot();
  t.after(s.close);
  const admin = await s.login('9000000000', 'admin_app');
  const at = admin.json.accessToken;
  const mk = async (phone, name) => { await s.call('POST', '/v1/admin/staff', { token: at, body: { phone, role: 'rider', name } }); return s.login(phone, 'rider_app'); };
  const r1 = await mk('9860000001', 'Ravi Das');
  const r2 = await mk('9860000002', 'Sunil Paul');
  const cust = await onboard(s, '9861000001');

  await t.test('customers and unknown staff cannot reach rider endpoints', async () => {
    assert.equal((await s.call('GET', '/v1/rider/orders', { token: cust.token })).status, 403);
    assert.equal((await s.call('GET', '/v1/rider/me')).status, 401);
    assert.equal((await s.call('GET', '/v1/rider/orders', { token: at })).status, 403);
  });
  await t.test('offline riders see no available orders and cannot claim', async () => {
    const o = await placeOrder(s, cust);
    await advance(s, at, o.id, 'confirmed'); await advance(s, at, o.id, 'packed');
    const list = await s.call('GET', '/v1/rider/orders?scope=available', { token: r1.json.accessToken });
    assert.deepEqual(list.json, { items: [], online: false });
    const c = await s.call('POST', `/v1/rider/orders/${o.id}/claim`, { token: r1.json.accessToken });
    assert.equal(c.json.error.code, 'rider_offline');
  });

  let order;
  await t.test('available list hides customer details; claim is atomic (only one rider wins)', async () => {
    for (const r of [r1, r2]) await s.call('POST', '/v1/rider/status', { token: r.json.accessToken, body: { online: true } });
    const list = await s.call('GET', '/v1/rider/orders?scope=available', { token: r1.json.accessToken });
    assert.equal(list.json.items.length, 1);
    order = list.json.items[0];
    assert.equal(order.customer, undefined);
    assert.equal(order.address, undefined);
    assert.equal(order.area.pincode, '700016');
    assert.equal(order.earning, 30);
    const [a, b] = await Promise.all([s.call('POST', `/v1/rider/orders/${order.id}/claim`, { token: r1.json.accessToken }), s.call('POST', `/v1/rider/orders/${order.id}/claim`, { token: r2.json.accessToken })]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const winner = a.status === 200 ? a : b;
    assert.equal(winner.json.order.customer.name, 'Asha Roy');
    assert.ok(winner.json.order.address.line1);
    t.winner = a.status === 200 ? r1 : r2; t.loser = a.status === 200 ? r2 : r1;
  });
  await t.test('other rider cannot act on, or see, an assigned order', async () => {
    const lt = t.loser.json.accessToken;
    assert.equal((await s.call('GET', `/v1/rider/orders/${order.id}`, { token: lt })).status, 404);
    assert.equal((await s.call('POST', `/v1/rider/orders/${order.id}/pickup`, { token: lt })).status, 403);
    assert.equal((await s.call('POST', `/v1/rider/orders/${order.id}/deliver`, { token: lt, body: { code: '1234' } })).status, 403);
  });
  await t.test('customer sees rider + PIN; PIN is hidden from rider responses', async () => {
    const o = (await s.call('GET', `/v1/orders/${order.id}`, { token: cust.token })).json.order;
    assert.match(o.deliveryCode, /^\d{4}$/);
    assert.ok(['Ravi Das', 'Sunil Paul'].includes(o.rider.name));
    assert.equal(o.codeAttempts, undefined);
    const card = (await s.call('GET', `/v1/rider/orders/${order.id}`, { token: t.winner.json.accessToken })).json.order;
    assert.equal(JSON.stringify(card).includes(o.deliveryCode), false);
  });
  await t.test('delivery needs pickup first, then the correct PIN; wrong PIN attempts are capped', async () => {
    const wt = t.winner.json.accessToken;
    const pin = s.app.store.orders.get(order.id).deliveryCode;
    assert.equal((await s.call('POST', `/v1/rider/orders/${order.id}/deliver`, { token: wt, body: { code: pin } })).json.error.code, 'invalid_transition');
    assert.equal((await s.call('POST', `/v1/rider/orders/${order.id}/pickup`, { token: wt })).status, 200);
    assert.equal((await s.call('POST', `/v1/rider/orders/${order.id}/release`, { token: wt })).status, 409, 'cannot release after pickup');
    const wrong = pin === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) assert.equal((await s.call('POST', `/v1/rider/orders/${order.id}/deliver`, { token: wt, body: { code: wrong } })).json.error.code, 'wrong_code');
    assert.equal((await s.call('POST', `/v1/rider/orders/${order.id}/deliver`, { token: wt, body: { code: pin } })).json.error.code, 'code_locked');
    s.app.store.orders.get(order.id).codeAttempts = 0; // support reset
    assert.equal((await s.call('POST', `/v1/rider/orders/${order.id}/deliver`, { token: wt, body: { code: 'abcd' } })).status, 422);
    const ok = await s.call('POST', `/v1/rider/orders/${order.id}/deliver`, { token: wt, body: { code: pin } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.today.deliveries, 1);
    assert.equal(ok.json.today.earnings, 30);
  });
  await t.test('earnings ledger, cash held and settlement; no double credit', async () => {
    const wt = t.winner.json.accessToken;
    const e = (await s.call('GET', '/v1/rider/earnings', { token: wt })).json;
    assert.equal(e.items.length, 1);
    assert.equal(e.cashHeld, 308 - 0, 'COD collected = order total (11 x 28)');
    const me = (await s.call('GET', '/v1/rider/me', { token: wt })).json;
    const rid = me.rider.id;
    assert.equal((await s.call('POST', `/v1/admin/riders/${rid}/settle`, { token: at, body: { amount: 9999 } })).status, 422);
    assert.equal((await s.call('POST', `/v1/admin/riders/${rid}/settle`, { token: at, body: { amount: 300 } })).json.cashHeld, 8);
    assert.equal((await s.call('POST', `/v1/admin/riders/${rid}/settle`, { token: wt, body: { amount: 1 } })).status, 403);
    assert.equal(s.app.store.riderLedger.get(rid).length, 1);
    const done = (await s.call('GET', '/v1/rider/orders?scope=done', { token: wt })).json.items;
    assert.equal(done.length, 1);
  });
  await t.test('release puts the order back; max concurrent active orders enforced; admin can dispatch', async () => {
    const rt = r1.json.accessToken;
    const made = [];
    for (let i = 0; i < 4; i++) { const o = await placeOrder(s, cust, 11); await advance(s, at, o.id, 'confirmed'); await advance(s, at, o.id, 'packed'); made.push(o); }
    for (let i = 0; i < 3; i++) assert.equal((await s.call('POST', `/v1/rider/orders/${made[i].id}/claim`, { token: rt })).status, 200);
    assert.equal((await s.call('POST', `/v1/rider/orders/${made[3].id}/claim`, { token: rt })).json.error.code, 'too_many_active');
    assert.equal((await s.call('POST', `/v1/rider/orders/${made[0].id}/release`, { token: rt })).status, 200);
    assert.equal((await s.call('POST', `/v1/rider/orders/${made[3].id}/claim`, { token: rt })).status, 200);
    const rid2 = (await s.call('GET', '/v1/rider/me', { token: r2.json.accessToken })).json.rider.id;
    assert.equal((await s.call('POST', `/v1/admin/orders/${made[0].id}/assign`, { token: at, body: { riderId: rid2 } })).status, 200);
    assert.equal((await s.call('POST', `/v1/admin/orders/${made[0].id}/assign`, { token: at, body: { riderId: rid2 } })).status, 409);
  });
  await t.test('realtime: online riders get new orders and "taken" events; offline riders do not', async () => {
    const mkWs = async (r) => { const c = await wsOpen(s.wsUrl); c.ws.send(JSON.stringify({ type: 'auth', token: r.json.accessToken })); await waitFor(() => c.msgs.find((m) => m.type === 'ready')); return c; };
    const a = await mkWs(r1), b = await mkWs(r2);
    await s.call('POST', '/v1/rider/status', { token: r2.json.accessToken, body: { online: false } });
    const o = await placeOrder(s, cust, 11);
    await advance(s, at, o.id, 'confirmed'); await advance(s, at, o.id, 'packed');
    const ev = await waitFor(() => a.msgs.find((m) => m.type === 'order_available' && m.order.id === o.id));
    assert.ok(ev, 'online rider notified');
    assert.equal(ev.order.customer, undefined);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!b.msgs.some((m) => m.type === 'order_available'), 'offline rider not notified');
    await s.call('POST', '/v1/rider/orders/' + o.id + '/claim', { token: r1.json.accessToken }).catch(() => {});
    a.ws.close(); b.ws.close();
  });
  await t.test('push fan-out goes only to online riders with registered devices', async () => {
    await s.call('POST', '/v1/me/devices', { token: r1.json.accessToken, body: { token: 'ExponentPushToken[r1]', platform: 'android' } });
    await s.call('POST', '/v1/me/devices', { token: r2.json.accessToken, body: { token: 'ExponentPushToken[r2]', platform: 'android' } });
    await s.call('POST', '/v1/rider/status', { token: r2.json.accessToken, body: { online: false } });
    s.app.notifier.pushLog.length = 0;
    const o = await placeOrder(s, cust, 11);
    await advance(s, at, o.id, 'confirmed'); await advance(s, at, o.id, 'packed');
    await new Promise((r) => setTimeout(r, 80));
    assert.deepEqual(s.app.notifier.pushLog.map((p) => p.count), [1]);
    await s.call('POST', '/v1/rider/orders/' + o.id + '/claim', { token: r1.json.accessToken }).catch(() => {});
  });
  await t.test('admin cancel of an assigned order frees the rider', async () => {
    const o = await placeOrder(s, cust, 11);
    await advance(s, at, o.id, 'confirmed'); await advance(s, at, o.id, 'packed');
    await s.call('POST', '/v1/rider/status', { token: r2.json.accessToken, body: { online: true } });
    assert.equal((await s.call('POST', `/v1/rider/orders/${o.id}/claim`, { token: r2.json.accessToken })).status, 200);
    assert.equal((await advance(s, at, o.id, 'cancelled')).status, 200);
    const active = (await s.call('GET', '/v1/rider/orders?scope=active', { token: r2.json.accessToken })).json.items;
    assert.ok(!active.some((x) => x.id === o.id));
  });
});
