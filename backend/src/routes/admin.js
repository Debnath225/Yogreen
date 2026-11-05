import { V, forbidden, notFound, HttpError, normalizePhone } from '../lib/http.js';
import { customerOrder, publicUser } from './shared.js';

const STAFF = ['admin', 'super_admin'];
const staffOnly = { auth: true, roles: STAFF };
const ok = (body, status = 200) => ({ status, body });

export function registerAdminRoutes(app) {
  const { router, store, catalog, orders, riders, notifier } = app;
  router.add('PATCH', '/v1/admin/products/:id', staffOnly, async ({ user, params, body }) => ok(await catalog.update(user, V.str(params, 'id', { max: 64 }), {
    price: V.num(body, 'price', { min: 0.5, max: 100000, optional: true }),
    mrp: V.num(body, 'mrp', { min: 0.5, max: 100000, optional: true }),
    stock: V.int(body, 'stock', { min: 0, max: 1_000_000, optional: true }),
    active: V.bool(body, 'active', { optional: true }),
  })));
  router.add('POST', '/v1/admin/prices/bulk', staffOnly, async ({ user, body }) => {
    const updates = V.arr(body, 'updates', { min: 1, max: 200 }).map((update) => ({
      id: V.str(update, 'id', { max: 64 }),
      price: V.num(update, 'price', { min: 0.5, max: 100000 }),
    }));
    for (const update of updates) if (!await catalog.get(update.id)) throw notFound(`Unknown product ${update.id}`);
    return ok({ items: await Promise.all(updates.map((update) => catalog.update(user, update.id, { price: update.price }))) });
  });
  router.add('GET', '/v1/admin/price-history/:id', staffOnly, async ({ params }) => ok({
    items: await store.listPriceHistory(V.str(params, 'id', { max: 64 })),
  }));
  router.add('GET', '/v1/admin/orders', staffOnly, async ({ query }) => {
    const status = V.oneOf({ status: query.get('status') ?? undefined }, 'status', ['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'], { optional: true });
    return ok({ items: await store.listOrders(status, 100) });
  });
  router.add('PATCH', '/v1/admin/orders/:id/status', { auth: true, roles: [...STAFF, 'rider'] }, async ({ user, params, body }) => {
    const order = await store.getOrder(V.str(params, 'id', { max: 64 }));
    if (!order) throw notFound('Order not found');
    if (user.role === 'rider' && order.riderId && order.riderId !== user.id) throw forbidden('This order is assigned to another rider');
    const to = V.oneOf(body, 'status', ['confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled']);
    await store.appendAudit(user.id, 'order.status', { id: order.id, to });
    const updated = await orders.transition(user, order, to);
    if (to === 'packed') await riders.orderPacked(updated);
    return ok({ order: await customerOrder(store, updated) });
  });
  router.add('POST', '/v1/admin/notifications', staffOnly, async ({ user, body }) => {
    const title = V.str(body, 'title', { max: 80 });
    const text = V.str(body, 'body', { max: 240 });
    const target = V.obj(body, 'target');
    const type = V.oneOf(target, 'type', ['all', 'user']);
    let audience = 'all';
    if (type === 'user') {
      audience = V.str(target, 'userId', { max: 64 });
      if (!await store.findUser(audience)) throw notFound('User not found');
    }
    await store.appendAudit(user.id, 'notification.send', { audience, title });
    return ok({ notification: await notifier.create({ audience, title, body: text, data: { type: 'broadcast' } }) }, 201);
  });
  router.add('POST', '/v1/admin/staff', { auth: true, roles: ['super_admin'] }, async ({ user, body }) => {
    const phone = normalizePhone(body.phone);
    const role = V.oneOf(body, 'role', ['rider', 'admin']);
    const name = V.str(body, 'name', { min: 2, max: 60, re: /^[\p{L}][\p{L}\p{M} .'-]*$/u });
    if (await store.findUserByPhone(phone)) throw new HttpError(409, 'exists', 'This number is already registered');
    let staff;
    try {
      staff = await store.insertUser({
        id: store.id(), phone, role, name, status: 'active', setupCompleted: true, createdAt: Date.now(),
        notifReadAt: 0, addresses: [], prefs: { language: 'en', pushEnabled: true },
      });
    } catch (error) {
      if (error.code === 11000 && await store.findUserByPhone(phone)) throw new HttpError(409, 'exists', 'This number is already registered');
      throw error;
    }
    await store.appendAudit(user.id, 'staff.create', { id: staff.id, role });
    return ok({ user: publicUser(staff) }, 201);
  });
  router.add('POST', '/v1/admin/orders/:id/assign', staffOnly, async ({ user, params, body }) => {
    const orderId = V.str(params, 'id', { max: 64 });
    const riderId = V.str(body, 'riderId', { max: 64 });
    const order = await riders.assign(user, orderId, riderId);
    await store.appendAudit(user.id, 'order.assign', { orderId, riderId });
    return ok({ order });
  });
  router.add('POST', '/v1/admin/riders/:id/settle', staffOnly, async ({ user, params, body }) => {
    const riderId = V.str(params, 'id', { max: 64 });
    const amount = V.num(body, 'amount', { min: 0.01, max: 1_000_000 });
    const result = await riders.settle(user, riderId, amount);
    await store.appendAudit(user.id, 'rider.settle', { riderId, amount });
    return ok(result);
  });
}
