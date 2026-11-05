import { V, bad, notFound, HttpError } from '../lib/http.js';
import { customerOrder, parseItems } from './shared.js';

const ok = (body, status = 200) => ({ status, body });
const auth = { auth: true };

export function registerShopRoutes(app) {
  const { router, store, catalog, orders, wallet } = app;
  router.add('GET', '/v1/products', {}, async ({ headers }) => {
    const snapshot = await catalog.snapshot();
    const responseHeaders = { etag: snapshot.etag, 'cache-control': 'public, max-age=5, must-revalidate' };
    if (headers['if-none-match'] === snapshot.etag) return { status: 304, headers: responseHeaders };
    return { status: 200, raw: snapshot.body, headers: responseHeaders };
  });
  router.add('GET', '/v1/cart', auth, async ({ user }) => ok({ items: await store.getCart(user.id) }));
  router.add('PUT', '/v1/cart', auth, async ({ user, body }) => {
    const items = V.arr(body, 'items', { max: 50 }).map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw bad('validation_error', `items[${index}] must be an object`);
      return { productId: V.str(item, 'productId', { max: 64 }), qty: V.int(item, 'qty', { min: 1, max: 20 }) };
    });
    if (new Set(items.map((item) => item.productId)).size !== items.length) throw bad('validation_error', 'Cart items must have unique product IDs');
    const products = await store.getProducts(items.map((item) => item.productId));
    if (products.length !== items.length || products.some((product) => !product.active)) {
      throw new HttpError(422, 'product_unavailable', 'Cart contains an unavailable product');
    }
    return ok({ items: await store.setCart(user.id, items) });
  });
  router.add('POST', '/v1/cart/quote', auth, async ({ user, body }) => ok(await orders.quote(
    user, parseItems(body), V.int(body, 'useCoins', { min: 0, max: 100000, optional: true }) ?? 0,
  )));
  router.add('POST', '/v1/orders', { auth: true, rate: { key: 'order', limit: 20, windowMs: 60_000 } }, async ({ user, body, headers }) => {
    const key = headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8 || key.length > 64 || !/^[\w-]+$/.test(key)) {
      throw bad('idempotency_key_required', 'Idempotency-Key header (8-64 chars) is required');
    }
    const { order, replayed } = await orders.place(user, {
      items: parseItems(body),
      addressId: V.str(body, 'addressId', { max: 64 }),
      useCoins: V.int(body, 'useCoins', { min: 0, max: 100000, optional: true }) ?? 0,
      note: V.str(body, 'note', { max: 200, optional: true }),
    }, key);
    return ok({ order: await customerOrder(store, order), wallet: await wallet.summary(user) }, replayed ? 200 : 201);
  });
  router.add('GET', '/v1/orders', auth, async ({ user }) => ok({
    items: await Promise.all((await orders.forUser(user.id)).map((order) => customerOrder(store, order))),
  }));
  const ownOrder = async (user, id) => {
    const order = await store.getOrder(id);
    if (!order || (order.userId !== user.id && !['admin', 'super_admin'].includes(user.role))) throw notFound('Order not found');
    return order;
  };
  router.add('GET', '/v1/orders/:id', auth, async ({ user, params }) => ok({
    order: await customerOrder(store, await ownOrder(user, params.id)),
  }));
  router.add('POST', '/v1/orders/:id/cancel', auth, async ({ user, params }) => {
    const order = await store.getOrder(params.id);
    if (!order || order.userId !== user.id) throw notFound('Order not found');
    return ok({ order: await orders.transition(user, order, 'cancelled'), wallet: await wallet.summary(user) });
  });
}
