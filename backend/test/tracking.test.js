import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { sleep, waitFor, wsOpen } from './helpers.js';

test('live tracking is restricted to the order owner and assigned rider', async (t) => {
  process.env.NODE_ENV = 'test';
  const app = createApp({ limits: { globalPerMin: 100_000 } });
  await app.ready;
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const customer = app.store.addUser({
    phone: '+919871000001', role: 'customer', setupCompleted: true,
    addresses: [{ id: 'address-1', label: 'Home', line1: '12 Park Street', pincode: '700016', lat: 22.5726, lng: 88.3639 }],
  });
  const rider = app.store.addUser({ phone: '+919870000001', role: 'rider', name: 'Ravi', online: true });
  const otherCustomer = app.store.addUser({ phone: '+919871000002', role: 'customer' });
  const otherRider = app.store.addUser({ phone: '+919870000002', role: 'rider' });
  const customerToken = (await app.tokens.startSession(customer, 'customer_app')).accessToken;
  const riderToken = (await app.tokens.startSession(rider, 'rider_app')).accessToken;
  const otherCustomerToken = (await app.tokens.startSession(otherCustomer, 'customer_app')).accessToken;
  const otherRiderToken = (await app.tokens.startSession(otherRider, 'rider_app')).accessToken;

  const product = [...app.store.products.values()].find((item) => item.sku === 'VEG-TOM');
  const placed = await app.orders.place(customer, { items: [{ productId: product.id, qty: 4 }], addressId: 'address-1' }, 'tracking-test-001');
  const admin = { id: 'admin', role: 'admin' };
  let order = await app.orders.transition(admin, placed.order, 'confirmed');
  order = await app.orders.transition(admin, order, 'packed');
  await app.riders.claim(rider, order.id);
  order = await app.riders.pickup(rider, order.id);
  assert.equal(order.status, 'out_for_delivery');

  const url = `ws://127.0.0.1:${app.server.address().port}/v1/ws`;
  const customerWs = await wsOpen(url);
  const riderWs = await wsOpen(url);
  const outsiderWs = await wsOpen(url);
  const otherRiderWs = await wsOpen(url);
  t.after(() => [customerWs, riderWs, outsiderWs, otherRiderWs].forEach(({ ws }) => ws.close()));

  customerWs.ws.send(JSON.stringify({ type: 'auth', token: customerToken }));
  riderWs.ws.send(JSON.stringify({ type: 'auth', token: riderToken }));
  outsiderWs.ws.send(JSON.stringify({ type: 'auth', token: otherCustomerToken }));
  otherRiderWs.ws.send(JSON.stringify({ type: 'auth', token: otherRiderToken }));
  await Promise.all([
    waitFor(() => customerWs.msgs.find((message) => message.type === 'ready')),
    waitFor(() => riderWs.msgs.find((message) => message.type === 'ready')),
    waitFor(() => outsiderWs.msgs.find((message) => message.type === 'ready')),
    waitFor(() => otherRiderWs.msgs.find((message) => message.type === 'ready')),
  ]);

  customerWs.ws.send(JSON.stringify({ type: 'tracking_subscribe', orderId: order.id }));
  const status = await waitFor(() => customerWs.msgs.find((message) => message.type === 'tracking_status' && message.orderId === order.id));
  assert.equal(status.status, 'out_for_delivery');
  outsiderWs.ws.send(JSON.stringify({ type: 'tracking_subscribe', orderId: order.id }));
  assert.ok(await waitFor(() => outsiderWs.msgs.find((message) => message.type === 'tracking_error')));

  otherRiderWs.ws.send(JSON.stringify({ type: 'rider_location', orderId: order.id, location: { latitude: 22.57, longitude: 88.36 } }));
  assert.ok(await waitFor(() => otherRiderWs.msgs.find((message) => message.type === 'tracking_error')));
  riderWs.ws.send(JSON.stringify({ type: 'rider_location', orderId: order.id, location: { latitude: 22.573, longitude: 88.364 } }));
  const location = await waitFor(() => customerWs.msgs.find((message) => message.type === 'tracking_location' && message.location?.latitude === 22.573));
  assert.equal(location.location.longitude, 88.364);
  assert.equal(typeof location.location.updatedAt, 'number');

  riderWs.ws.close();
  await waitFor(() => customerWs.msgs.find((message) => message.type === 'tracking_location' && message.location === null));
  await sleep(20);
});
