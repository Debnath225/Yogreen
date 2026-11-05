import { HttpError } from '../lib/http.js';
import { randomInt } from 'node:crypto';

const money = (paise) => Math.round(paise) / 100;
const paise = (r) => Math.round(r * 100);
export const ORDER_FLOW = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};
const RIDER_MOVES = new Set(['packed>out_for_delivery', 'out_for_delivery>delivered']);
const LABEL = { confirmed: 'confirmed', packed: 'packed', out_for_delivery: 'on the way', delivered: 'delivered', cancelled: 'cancelled' };

export class Orders {
  constructor(cfg, store, catalog, wallet, notifier, bus) { Object.assign(this, { cfg, store, catalog, wallet, notifier, bus }); }

  /** Server-side pricing: the client never supplies prices or totals. */
  async quote(user, items, useCoins = 0) {
    const merged = new Map();
    for (const it of items) merged.set(it.productId, (merged.get(it.productId) || 0) + it.qty);
    const products = await this.store.getProducts([...merged.keys()]);
    const lines = [];
    let subPaise = 0;
    for (const [productId, qty] of merged) {
      const p = products.find((product) => product.id === productId);
      if (!p || !p.active) throw new HttpError(422, 'product_unavailable', 'An item in your cart is no longer available', { productId });
      if (p.stock < qty) throw new HttpError(409, 'insufficient_stock', `Only ${p.stock} left for ${p.name}`, { productId, available: p.stock });
      const lineP = paise(p.price) * qty;
      subPaise += lineP;
      lines.push({ productId, name: p.name, unit: p.unit, emoji: p.emoji, qty, unitPrice: p.price, lineTotal: money(lineP) });
    }
    const subtotal = money(subPaise);
    if (subtotal < this.cfg.delivery.minOrder) throw new HttpError(422, 'below_minimum', `Minimum order is ₹${this.cfg.delivery.minOrder}`, { minOrder: this.cfg.delivery.minOrder });
    const deliveryFee = subtotal >= this.cfg.delivery.freeAbove ? 0 : this.cfg.delivery.fee;
    const maxByCap = Math.floor(subtotal * this.cfg.ygc.maxRedeemPct / this.cfg.ygc.valueInr);
    const balance = await this.wallet.balance(user.id);
    const coinsUsed = Math.max(0, Math.min(useCoins, maxByCap, balance));
    const discount = coinsUsed * this.cfg.ygc.valueInr;
    const total = money(subPaise + paise(deliveryFee) - paise(discount));
    const earnEstimate = Math.floor(total * this.cfg.ygc.earnRate / this.cfg.ygc.valueInr);
    return { lines, subtotal, deliveryFee, coinsUsed, coinDiscount: discount, total, earnEstimate, maxRedeemable: Math.min(maxByCap, balance) };
  }

  async place(user, { items, addressId, useCoins, note }, idemKey) {
    const prior = await this.store.findOrderByIdempotency(user.id, idemKey);
    if (prior) return { order: prior, replayed: true };
    const address = user.addresses.find((a) => a.id === addressId);
    if (!address) throw new HttpError(422, 'validation_error', 'addressId: unknown address', { field: 'addressId' });
    const quote = await this.quote(user, items, useCoins);
    const now = Date.now();
    const order = {
      id: this.store.id(), number: 'YG' + now.toString(36).toUpperCase().slice(-6), userId: user.id, status: 'placed',
      riderId: null, deliveryCode: String(randomInt(0, 10000)).padStart(4, '0'), codeAttempts: 0,
      lines: quote.lines, subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, coinsUsed: quote.coinsUsed,
      coinDiscount: quote.coinDiscount, total: quote.total, earnEstimate: quote.earnEstimate, coinsAwarded: 0,
      payment: { method: 'cod', status: 'pending' }, address: { ...address }, note: note || '',
      history: [{ status: 'placed', at: now }], createdAt: now,
    };
    const ledgerEntry = quote.coinsUsed > 0
      ? this.wallet.createEntry(user.id, 'redeem', -quote.coinsUsed, `Used on order ${order.number}`, order.id)
      : null;
    let result;
    try {
      result = await this.store.createOrderAtomic(order, idemKey, quote.lines, ledgerEntry);
    } catch (error) {
      if (error.message.startsWith('INSUFFICIENT_STOCK:')) {
        const productId = error.message.slice('INSUFFICIENT_STOCK:'.length);
        const product = await this.store.getProduct(productId);
        throw new HttpError(409, 'insufficient_stock', `Only ${product?.stock || 0} left for ${product?.name || 'this item'}`, { productId, available: product?.stock || 0 });
      }
      if (error.message === 'INSUFFICIENT_COINS') throw new HttpError(409, 'insufficient_coins', 'Not enough YGC coins');
      throw error;
    }
    const products = await this.store.getProducts(quote.lines.map((line) => line.productId));
    this.catalog.stockChanged(products);
    if (!result.replayed) await this.notifier.create({ audience: user.id, title: 'Order placed 🎉', body: `Order ${order.number} for ₹${order.total} is placed.`, data: { type: 'order', orderId: order.id } });
    return result;
  }

  forUser(userId) { return this.store.listOrdersForUser(userId); }

  async transition(actor, order, to) {
    if (!ORDER_FLOW[order.status].includes(to)) throw new HttpError(409, 'invalid_transition', `Cannot move order from ${order.status} to ${to}`);
    if (actor.role === 'rider' && !RIDER_MOVES.has(`${order.status}>${to}`)) throw new HttpError(403, 'forbidden', 'Riders can only dispatch and deliver');
    if (actor.role === 'customer' && !(to === 'cancelled' && ['placed', 'confirmed'].includes(order.status))) throw new HttpError(409, 'not_cancellable', 'Order can no longer be cancelled');
    const expectedStatus = order.status;
    const updated = structuredClone(order);
    updated.status = to;
    updated.history.push({ status: to, at: Date.now(), by: actor.id });
    const stockRestores = to === 'cancelled' ? updated.lines.map(({ productId, qty }) => ({ productId, qty })) : [];
    let ledgerEntry = null;
    if (to === 'cancelled' && updated.coinsUsed > 0) {
      ledgerEntry = this.wallet.createEntry(updated.userId, 'refund', updated.coinsUsed, `Refund for order ${updated.number}`, updated.id);
    }
    if (to === 'delivered') {
      updated.payment.status = 'paid';
      const coins = Math.floor(updated.total * this.cfg.ygc.earnRate / this.cfg.ygc.valueInr);
      if (coins > 0 && !updated.coinsAwarded) {
        ledgerEntry = this.wallet.createEntry(updated.userId, 'earn', coins, `Earned on order ${updated.number}`, updated.id);
        updated.coinsAwarded = coins;
      }
    }
    try {
      await this.store.updateOrderAtomic(updated, expectedStatus, stockRestores, ledgerEntry);
    } catch (error) {
      if (error.message === 'ORDER_STATE_CHANGED') throw new HttpError(409, 'invalid_transition', 'Order status changed; reload and try again');
      throw error;
    }
    this.bus?.publish('order:status', { orderId: updated.id, userId: updated.userId, status: updated.status });
    if (stockRestores.length) this.catalog.stockChanged(await this.store.getProducts(stockRestores.map((line) => line.productId)));
    const extra = to === 'delivered' && updated.coinsAwarded ? ` You earned ${updated.coinsAwarded} YGC!` : '';
    await this.notifier.create({ audience: updated.userId, title: `Order ${LABEL[to]}`, body: `Order ${updated.number} is ${LABEL[to]}.${extra}`, data: { type: 'order', orderId: updated.id } });
    return updated;
  }
}
