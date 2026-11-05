import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboard, wsOpen, waitFor, ADDR } from './helpers.js';

const pid = (s, sku) => [...s.app.store.products.values()].find((p) => p.sku === sku).id;
const addrId = async (s, token) => (await s.call('GET', '/v1/me/addresses', { token })).json.items[0].id;
let n = 0;
const idem = () => `idem-key-${Date.now()}-${n++}`;

test('onboarding + YGC coins', async (t) => {
  const s = await boot();
  t.after(s.close);

  await t.test('setup grants welcome bonus exactly once', async () => {
    const u = await onboard(s, '9840000001');
    assert.equal(u.setup.status, 200);
    assert.equal(u.setup.json.bonusGranted, 50);
    assert.equal(u.setup.json.wallet.balance, 50);
    const again = await s.call('PUT', '/v1/me/setup', { token: u.token, body: { name: 'Asha Roy', address: ADDR } });
    assert.equal(again.json.bonusGranted, 0);
    assert.equal(again.json.wallet.balance, 50);
  });
  await t.test('setup validation', async () => {
    const v = await s.login('9840000002');
    const r = await s.call('PUT', '/v1/me/setup', { token: v.json.accessToken, body: { name: 'A', address: { ...ADDR, pincode: '12' } } });
    assert.equal(r.status, 422);
  });
  await t.test('daily check-in: once per day, history recorded', async () => {
    const u = await onboard(s, '9840000003');
    const c = await s.call('POST', '/v1/wallet/checkin', { token: u.token });
    assert.equal(c.status, 200);
    assert.equal(c.json.streak, 1);
    assert.equal(c.json.earned, 2);
    assert.equal((await s.call('POST', '/v1/wallet/checkin', { token: u.token })).status, 409);
    const h = await s.call('GET', '/v1/wallet/history', { token: u.token });
    assert.deepEqual(h.json.items.map((e) => e.type), ['checkin', 'bonus']);
    assert.equal(h.json.items[0].balanceAfter, 52);
  });
  await t.test('streak continues on consecutive IST days', async () => {
    const u = await onboard(s, '9840000004');
    const user = s.app.store.users.get(u.user.id);
    const IST = 5.5 * 3600_000;
    const today = Math.floor((Date.now() + IST) / 86_400_000);
    user.checkin = { lastDay: today - 1, streak: 3 };
    const c = await s.call('POST', '/v1/wallet/checkin', { token: u.token });
    assert.equal(c.json.streak, 4);
    assert.equal(c.json.earned, 2 + 4 - 1);
  });
});

test('catalog, price control, realtime', async (t) => {
  const s = await boot();
  t.after(s.close);
  const cust = await onboard(s, '9841000001');
  const admin = await s.login('9000000000', 'admin_app');
  const tom = pid(s, 'VEG-TOM');

  await t.test('public product list is ETag cached (304) and invalidated on change', async () => {
    const a = await s.call('GET', '/v1/products');
    assert.equal(a.status, 200);
    assert.ok(a.json.items.length >= 10);
    const tomato = a.json.items.find((item) => item.id === tom);
    assert.match(tomato.imageUrl, /^https:\/\/images\.unsplash\.com\//);
    assert.ok(tomato.description && tomato.storage && tomato.highlights.length);
    const saved = await s.call('PUT', '/v1/cart', { token: cust.token, body: { items: [{ productId: tom, qty: 2 }] } });
    assert.deepEqual(saved.json.items, [{ productId: tom, qty: 2 }]);
    assert.deepEqual((await s.call('GET', '/v1/cart', { token: cust.token })).json.items, [{ productId: tom, qty: 2 }]);
    assert.equal((await s.call('PUT', '/v1/cart', { token: cust.token, body: { items: [{ productId: tom, qty: 21 }] } })).status, 422);
    assert.equal((await s.call('PUT', '/v1/cart', { token: cust.token, body: { items: [{ productId: 'missing', qty: 1 }] } })).status, 422);
    const anotherCustomer = await onboard(s, '9841000002');
    assert.deepEqual((await s.call('GET', '/v1/cart', { token: anotherCustomer.token })).json.items, []);
    const etag = a.headers.get('etag');
    assert.equal((await s.call('GET', '/v1/products', { headers: { 'if-none-match': etag } })).status, 304);
    await s.call('PATCH', `/v1/admin/products/${tom}`, { token: admin.json.accessToken, body: { price: 40 } });
    const b = await s.call('GET', '/v1/products', { headers: { 'if-none-match': etag } });
    assert.equal(b.status, 200);
    assert.equal(b.json.items.find((i) => i.id === tom).price, 40);
  });
  await t.test('only staff can change prices; validation guards', async () => {
    assert.equal((await s.call('PATCH', `/v1/admin/products/${tom}`, { token: cust.token, body: { price: 1 } })).status, 403);
    assert.equal((await s.call('PATCH', `/v1/admin/products/${tom}`, { token: admin.json.accessToken, body: { price: 9999 } })).status, 422, 'price above mrp');
    assert.equal((await s.call('PATCH', `/v1/admin/products/${tom}`, { token: admin.json.accessToken, body: { price: '40' } })).status, 422);
    assert.equal((await s.call('PATCH', '/v1/admin/products/nope', { token: admin.json.accessToken, body: { price: 40 } })).status, 404);
  });
  await t.test('large price swing requires super_admin; plain admin is refused; history audited', async () => {
    const staff = await s.call('POST', '/v1/admin/staff', { token: admin.json.accessToken, body: { phone: '9850000001', role: 'admin', name: 'Ops Admin' } });
    assert.equal(staff.status, 201);
    const ops = await s.login('9850000001', 'admin_app');
    assert.equal(ops.json.user.role, 'admin');
    const big = await s.call('PATCH', `/v1/admin/products/${tom}`, { token: ops.json.accessToken, body: { price: 20 } });
    assert.equal(big.status, 403);
    assert.equal(big.json.error.code, 'price_change_too_large');
    assert.equal((await s.call('PATCH', `/v1/admin/products/${tom}`, { token: ops.json.accessToken, body: { price: 42 } })).status, 200);
    assert.equal((await s.call('POST', '/v1/admin/staff', { token: ops.json.accessToken, body: { phone: '9850000002', role: 'rider', name: 'Rider One' } })).status, 403, 'only super_admin makes staff');
    const hist = await s.call('GET', `/v1/admin/price-history/${tom}`, { token: admin.json.accessToken });
    assert.ok(hist.json.items.length >= 2);
  });
  await t.test('WebSocket: price changes are pushed in real time', async () => {
    const { ws, msgs } = await wsOpen(s.wsUrl);
    await waitFor(() => msgs.find((m) => m.type === 'hello'));
    await s.call('PATCH', `/v1/admin/products/${tom}`, { token: admin.json.accessToken, body: { price: 41 } });
    const m = await waitFor(() => msgs.find((x) => x.type === 'prices'));
    assert.equal(m.items[0].id, tom);
    assert.equal(m.items[0].price, 41);
    ws.close();
  });
  await t.test('WebSocket: invalid token rejected; ping/pong', async () => {
    const { ws, msgs } = await wsOpen(s.wsUrl);
    ws.send(JSON.stringify({ type: 'auth', token: 'bad' }));
    ws.send(JSON.stringify({ type: 'ping' }));
    assert.ok(await waitFor(() => msgs.find((m) => m.type === 'auth_error')));
    assert.ok(await waitFor(() => msgs.find((m) => m.type === 'pong')));
    ws.close();
  });
  await t.test('WebSocket upgrade with disallowed origin is refused', async () => {
    const strict = await boot({ corsOrigins: ['https://ok.test'] });
    await assert.rejects(() => new Promise((res, rej) => { const w = new WebSocket(strict.wsUrl, { headers: { origin: 'https://evil.test' } }); w.onopen = res; w.onerror = rej; }));
    await strict.close();
  });
});

test('orders, stock, coins lifecycle', async (t) => {
  const s = await boot();
  t.after(s.close);
  const admin = await s.login('9000000000', 'admin_app');
  const at = admin.json.accessToken;
  const cust = await onboard(s, '9842000001');
  const other = await onboard(s, '9842000002');
  const aid = await addrId(s, cust.token);
  const pot = pid(s, 'VEG-POT'); // ₹28/kg
  const items = [{ productId: pot, qty: 10 }]; // ₹280 -> below free delivery (299)

  await t.test('quote is computed server-side with delivery fee and coin cap', async () => {
    const q = await s.call('POST', '/v1/cart/quote', { token: cust.token, body: { items, useCoins: 1000 } });
    assert.equal(q.status, 200);
    assert.equal(q.json.subtotal, 280);
    assert.equal(q.json.deliveryFee, 25);
    assert.equal(q.json.coinsUsed, 28, '10% of subtotal cap');
    assert.equal(q.json.total, 280 + 25 - 28);
    const free = await s.call('POST', '/v1/cart/quote', { token: cust.token, body: { items: [{ productId: pot, qty: 11 }] } });
    assert.equal(free.json.deliveryFee, 0);
  });
  await t.test('rejects unknown product, below-minimum, over-stock, bad qty', async () => {
    assert.equal((await s.call('POST', '/v1/cart/quote', { token: cust.token, body: { items: [{ productId: 'x', qty: 1 }] } })).status, 422);
    assert.equal((await s.call('POST', '/v1/cart/quote', { token: cust.token, body: { items: [{ productId: pid(s, 'LEA-COR'), qty: 1 }] } })).json.error.code, 'below_minimum');
    assert.equal((await s.call('POST', '/v1/cart/quote', { token: cust.token, body: { items: [{ productId: pot, qty: 0 }] } })).status, 422);
    assert.equal((await s.call('POST', '/v1/cart/quote', { token: cust.token, body: { items: [{ productId: pot, qty: 1.5 }] } })).status, 422);
  });

  let order;
  const key = idem();
  await t.test('place order: stock decremented, coins redeemed, idempotent replay', async () => {
    const stockBefore = s.app.store.products.get(pot).stock;
    const r = await s.call('POST', '/v1/orders', { token: cust.token, headers: { 'idempotency-key': key }, body: { items, addressId: aid, useCoins: 28 } });
    assert.equal(r.status, 201);
    order = r.json.order;
    assert.equal(order.total, 277);
    assert.equal(order.status, 'placed');
    assert.equal(r.json.wallet.balance, 50 - 28);
    assert.equal(s.app.store.products.get(pot).stock, stockBefore - 10);
    const replay = await s.call('POST', '/v1/orders', { token: cust.token, headers: { 'idempotency-key': key }, body: { items, addressId: aid, useCoins: 28 } });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.order.id, order.id);
    assert.equal(s.app.store.products.get(pot).stock, stockBefore - 10, 'no double decrement');
    assert.equal(replay.json.wallet.balance, 22, 'no double coin debit');
  });
  await t.test('Idempotency-Key required; address must belong to caller', async () => {
    assert.equal((await s.call('POST', '/v1/orders', { token: cust.token, body: { items, addressId: aid } })).status, 400);
    const foreign = await s.call('POST', '/v1/orders', { token: other.token, headers: { 'idempotency-key': idem() }, body: { items, addressId: aid } });
    assert.equal(foreign.status, 422);
  });
  await t.test('orders are private to their owner', async () => {
    assert.equal((await s.call('GET', `/v1/orders/${order.id}`, { token: other.token })).status, 404);
    assert.equal((await s.call('POST', `/v1/orders/${order.id}/cancel`, { token: other.token })).status, 404);
    assert.equal((await s.call('GET', '/v1/orders', { token: cust.token })).json.items.length, 1);
  });
  await t.test('price is locked at order time even if admin changes price later', async () => {
    await s.call('PATCH', `/v1/admin/products/${pot}`, { token: at, body: { price: 30 } });
    assert.equal((await s.call('GET', `/v1/orders/${order.id}`, { token: cust.token })).json.order.total, 277);
  });
  await t.test('concurrent orders cannot oversell stock', async () => {
    const lime = pid(s, 'FRU-LEM'); // price 8, stock 300 -> set stock to 20
    await s.call('PATCH', `/v1/admin/products/${lime}`, { token: at, body: { stock: 20 } });
    const mk = (i) => s.call('POST', '/v1/orders', { token: cust.token, headers: { 'idempotency-key': `race-key-${i}-${Date.now()}` }, body: { items: [{ productId: lime, qty: 15 }], addressId: aid } });
    const rs = await Promise.all([mk(1), mk(2), mk(3)]);
    assert.equal(rs.filter((r) => r.status === 201).length, 1);
    assert.equal(rs.filter((r) => r.status === 409).length, 2);
    assert.equal(s.app.store.products.get(lime).stock, 5);
  });
  await t.test('status flow: customer cannot advance; rider limited; invalid transitions blocked', async () => {
    assert.equal((await s.call('PATCH', `/v1/admin/orders/${order.id}/status`, { token: cust.token, body: { status: 'delivered' } })).status, 403);
    await s.call('POST', '/v1/admin/staff', { token: at, body: { phone: '9851000001', role: 'rider', name: 'Rider One' } });
    const rider = await s.login('9851000001', 'rider_app');
    assert.equal((await s.call('PATCH', `/v1/admin/orders/${order.id}/status`, { token: at, body: { status: 'delivered' } })).status, 409, 'cannot skip steps');
    assert.equal((await s.call('PATCH', `/v1/admin/orders/${order.id}/status`, { token: at, body: { status: 'confirmed' } })).status, 200);
    assert.equal((await s.call('PATCH', `/v1/admin/orders/${order.id}/status`, { token: rider.json.accessToken, body: { status: 'packed' } })).status, 403);
    assert.equal((await s.call('PATCH', `/v1/admin/orders/${order.id}/status`, { token: at, body: { status: 'packed' } })).status, 200);
    assert.equal((await s.call('PATCH', `/v1/admin/orders/${order.id}/status`, { token: rider.json.accessToken, body: { status: 'out_for_delivery' } })).status, 200);
    const done = await s.call('PATCH', `/v1/admin/orders/${order.id}/status`, { token: rider.json.accessToken, body: { status: 'delivered' } });
    assert.equal(done.status, 200);
    assert.equal(done.json.order.coinsAwarded, 5, '2% of 277 = 5.54 -> 5 YGC');
    const w = await s.call('GET', '/v1/wallet', { token: cust.token });
    assert.equal(w.json.balance, 22 + 5);
    assert.equal((await s.call('PATCH', `/v1/admin/orders/${order.id}/status`, { token: at, body: { status: 'delivered' } })).status, 409, 'terminal state; coins not awarded twice');
    assert.equal((await s.call('GET', '/v1/wallet', { token: cust.token })).json.balance, 27);
  });
  await t.test('customer cancel restores stock and refunds coins; delivered cannot be cancelled', async () => {
    const cu = await onboard(s, '9842000009');
    const a2 = await addrId(s, cu.token);
    const before = s.app.store.products.get(pot).stock;
    const r = await s.call('POST', '/v1/orders', { token: cu.token, headers: { 'idempotency-key': idem() }, body: { items: [{ productId: pot, qty: 10 }], addressId: a2, useCoins: 20 } });
    assert.equal(r.status, 201);
    assert.equal(s.app.store.products.get(pot).stock, before - 10);
    const c = await s.call('POST', `/v1/orders/${r.json.order.id}/cancel`, { token: cu.token });
    assert.equal(c.status, 200);
    assert.equal(c.json.order.status, 'cancelled');
    assert.equal(c.json.wallet.balance, 50, 'coins refunded');
    assert.equal(s.app.store.products.get(pot).stock, before);
    assert.equal((await s.call('POST', `/v1/orders/${order.id}/cancel`, { token: cust.token })).status, 409);
  });
});

test('notifications: admin send, inbox, realtime, push fan-out', async (t) => {
  const s = await boot();
  t.after(s.close);
  const admin = await s.login('9000000000', 'admin_app');
  const u1 = await onboard(s, '9843000001');
  const u2 = await onboard(s, '9843000002');

  await t.test('customers cannot send notifications', async () => {
    const r = await s.call('POST', '/v1/admin/notifications', { token: u1.token, body: { title: 'x', body: 'y', target: { type: 'all' } } });
    assert.equal(r.status, 403);
  });
  await t.test('device registration + targeted send + broadcast, unread count and mark read', async () => {
    assert.equal((await s.call('POST', '/v1/me/devices', { token: u1.token, body: { token: 'ExponentPushToken[abc]', platform: 'android' } })).status, 200);
    const before = (await s.call('GET', '/v1/notifications', { token: u1.token })).json.unread; // welcome
    assert.equal(before, 1);
    const sent = await s.call('POST', '/v1/admin/notifications', { token: admin.json.accessToken, body: { title: 'Fresh arrivals', body: 'Kanthali bananas are in!', target: { type: 'all' } } });
    assert.equal(sent.status, 201);
    await s.call('POST', '/v1/admin/notifications', { token: admin.json.accessToken, body: { title: 'Just for you', body: 'Hi u2', target: { type: 'user', userId: u2.user.id } } });
    const l1 = (await s.call('GET', '/v1/notifications', { token: u1.token })).json;
    const l2 = (await s.call('GET', '/v1/notifications', { token: u2.token })).json;
    assert.equal(l1.unread, 2);
    assert.equal(l2.unread, 3);
    assert.ok(!l1.items.some((n) => n.title === 'Just for you'), 'targeted message not visible to others');
    await s.call('POST', '/v1/notifications/read', { token: u1.token });
    assert.equal((await s.call('GET', '/v1/notifications', { token: u1.token })).json.unread, 0);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(s.app.notifier.pushLog.some((p) => p.count >= 1), 'push fan-out attempted for registered device');
  });
  await t.test('WebSocket: authed user receives own + broadcast notifications only', async () => {
    const { ws, msgs } = await wsOpen(s.wsUrl);
    ws.send(JSON.stringify({ type: 'auth', token: u1.token }));
    assert.ok(await waitFor(() => msgs.find((m) => m.type === 'ready')));
    await s.call('POST', '/v1/admin/notifications', { token: admin.json.accessToken, body: { title: 'Live!', body: 'broadcast', target: { type: 'all' } } });
    await s.call('POST', '/v1/admin/notifications', { token: admin.json.accessToken, body: { title: 'Private', body: 'for u2', target: { type: 'user', userId: u2.user.id } } });
    assert.ok(await waitFor(() => msgs.find((m) => m.type === 'notification' && m.notification.title === 'Live!')));
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!msgs.some((m) => m.notification?.title === 'Private'));
    ws.close();
  });
});
