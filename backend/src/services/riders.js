import { safeEqual } from '../lib/crypto.js';
import { HttpError, notFound } from '../lib/http.js';

const publicRider = (user) => ({ id: user.id, phone: user.phone, name: user.name || '', role: 'rider' });
const earningFor = (order) => Math.floor(order.total * 0.1);

function taskView(order, details = false, customer, rider) {
  const task = {
    id: order.id,
    number: order.number,
    status: order.status,
    itemCount: order.lines.reduce((sum, line) => sum + line.qty, 0),
    lines: order.lines.map(({ name, emoji, qty, unit }) => ({ name, emoji, qty, unit })),
    total: order.total,
    cashToCollect: order.payment?.method === 'cod' && order.payment.status !== 'paid' ? order.total : 0,
    paymentMethod: order.payment?.method || 'cod',
    earning: earningFor(order),
    area: { pincode: order.address.pincode, landmark: order.address.landmark || '' },
    createdAt: order.createdAt,
    mine: !!order.riderId,
  };
  if (details) {
    task.address = { label: order.address.label, line1: order.address.line1, landmark: order.address.landmark || '', pincode: order.address.pincode, lat: order.address.lat, lng: order.address.lng };
    task.note = order.note || '';
    task.history = order.history;
    if (customer) task.customer = { name: customer.name || '', phone: customer.phone };
    if (rider) task.rider = publicRider(rider);
  }
  return task;
}

export class Riders {
  constructor(store, bus, notifier, orders) { Object.assign(this, { store, bus, notifier, orders }); }

  async summary(user) {
    const [active, entries] = await Promise.all([
      this.store.listRiderOrders(user.id, 'active'),
      this.store.listRiderEarnings(user.id),
    ]);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startWeek = startToday - ((now.getDay() + 6) % 7) * 86_400_000;
    const sum = (rows) => ({ deliveries: rows.length, earnings: rows.reduce((total, row) => total + row.amount, 0) });
    const todayRows = entries.filter((row) => row.at >= startToday);
    const weekRows = entries.filter((row) => row.at >= startWeek);
    return {
      online: !!user.online,
      cashHeld: user.cashHeld || 0,
      active: active.length,
      today: sum(todayRows),
      week: sum(weekRows),
    };
  }

  async setOnline(user, online) {
    const updated = await this.store.setRiderOnline(user.id, online);
    return this.summary(updated);
  }

  async list(user, scope) {
    const rows = scope === 'available' && !user.online ? [] : await this.store.listRiderOrders(user.id, scope);
    const items = await Promise.all(rows.map(async (order) => {
      const rider = order.riderId ? await this.store.findUser(order.riderId) : null;
      return taskView(order, scope !== 'available', scope !== 'available' ? await this.store.findUser(order.userId) : null, rider);
    }));
    return { items, online: !!user.online };
  }

  async get(user, id) {
    const order = await this.store.getOrder(id);
    if (!order || order.riderId !== user.id) throw notFound('Order not found');
    return taskView(order, true, await this.store.findUser(order.userId), await this.store.findUser(order.riderId));
  }

  async claim(user, id) {
    if (!user.online) throw new HttpError(409, 'rider_offline', 'Go online before accepting an order');
    const { order, reason } = await this.store.claimRiderOrder(id, user.id, 3);
    if (!order) throw new HttpError(409, reason, reason === 'too_many_active' ? 'You already have the maximum number of active orders' : 'This order is no longer available');
    this.bus.publish('rider:event', { type: 'order_taken', orderId: id, riderId: user.id });
    return taskView(order, true, await this.store.findUser(order.userId), user);
  }

  async release(user, id) {
    const order = await this.store.getOrder(id);
    if (!order || order.riderId !== user.id) throw new HttpError(403, 'forbidden', 'This order is not assigned to you');
    if (order.status !== 'packed') throw new HttpError(409, 'invalid_transition', 'An order can only be released before pickup');
    const released = await this.store.releaseRiderOrder(id, user.id);
    if (!released) throw new HttpError(409, 'order_unavailable', 'This order can no longer be released');
    this.bus.publish('rider:event', { type: 'order_taken', orderId: id, riderId: null });
    await this.orderPacked(released);
    return taskView(released, true, await this.store.findUser(released.userId));
  }

  async pickup(user, id) {
    const order = await this.assigned(user, id);
    return taskView(await this.orders.transition(user, order, 'out_for_delivery'), true, await this.store.findUser(order.userId), user);
  }

  async deliver(user, id, code) {
    const order = await this.assigned(user, id);
    if (order.status !== 'out_for_delivery') throw new HttpError(409, 'invalid_transition', 'Order must be picked up before delivery');
    if ((order.codeAttempts || 0) >= 5) throw new HttpError(429, 'code_locked', 'Too many wrong codes. Contact support.');
    if (!safeEqual(String(code), String(order.deliveryCode || ''))) {
      await this.store.incrementDeliveryCodeAttempts(id, user.id);
      throw new HttpError(401, 'wrong_code', 'Incorrect delivery PIN');
    }
    const delivered = await this.orders.transition(user, order, 'delivered');
    const cash = order.payment?.method === 'cod' ? order.total : 0;
    await this.store.recordRiderEarning({
      id: this.store.id(), riderId: user.id, orderId: id, number: order.number,
      amount: earningFor(order), cash, at: delivered.history.at(-1).at,
    });
    const [summary, items] = await Promise.all([this.summary(user), this.store.listRiderEarnings(user.id)]);
    return { order: taskView(delivered, true, await this.store.findUser(order.userId), user), ...summary, items };
  }

  async assigned(user, id) {
    const order = await this.store.getOrder(id);
    if (!order || order.riderId !== user.id) throw new HttpError(403, 'forbidden', 'This order is not assigned to you');
    return order;
  }

  async earnings(user) {
    return { ...await this.summary(user), items: await this.store.listRiderEarnings(user.id) };
  }

  async assign(actor, id, riderId) {
    const rider = await this.store.findUser(riderId);
    if (!rider || rider.role !== 'rider' || rider.status !== 'active') throw notFound('Rider not found');
    const order = await this.store.assignRiderOrder(id, riderId);
    if (!order) throw new HttpError(409, 'order_unavailable', 'This order is already assigned or unavailable');
    this.bus.publish('rider:event', { type: 'order_assigned', orderId: id, riderId });
    return taskView(order, true, await this.store.findUser(order.userId), rider);
  }

  async settle(actor, riderId, amount) {
    const rider = await this.store.findUser(riderId);
    if (!rider || rider.role !== 'rider') throw notFound('Rider not found');
    const entry = { id: this.store.id(), riderId, amount, at: Date.now() };
    if (!await this.store.settleRiderCash(entry)) throw new HttpError(422, 'validation_error', 'Settlement amount exceeds cash held');
    return this.summary(await this.store.findUser(riderId));
  }

  async orderPacked(order) {
    const available = taskView(order);
    this.bus.publish('rider:event', { type: 'order_available', order: available });
    await this.notifier.pushRiderOrder(available);
  }
}
