/** Stores notifications, pushes them to live sockets, and fans out to device push (Expo) without blocking requests. */
export class Notifier {
  constructor(cfg, store, bus) { this.cfg = cfg; this.store = store; this.bus = bus; this.pushLog = []; }

  async create({ audience, title, body, data = {} }) {
    const n = { id: this.store.id(), audience, title, body, data, createdAt: Date.now() };
    await this.store.createNotification(n);
    this.bus.publish('notification', n);
    setImmediate(() => this.#push(n).catch((error) => console.error('[push:error]', error)));
    return n;
  }
  async forUser(user, { limit = 30 } = {}) {
    const mine = await this.store.listNotifications(user.id, limit);
    const unread = mine.filter((n) => n.createdAt > (user.notifReadAt || 0)).length;
    return { items: mine.map((n) => ({ ...n, unread: n.createdAt > (user.notifReadAt || 0) })), unread };
  }
  async markAllRead(user) {
    user.notifReadAt = Date.now();
    await this.store.patchUser(user.id, { notifReadAt: user.notifReadAt });
  }

  async pushRiderOrder(order) {
    setImmediate(() => this.#pushRiderOrder(order).catch((error) => console.error('[push:rider-error]', error)));
  }

  async #pushRiderOrder(order) {
    const tokens = await this.store.pushTokensForOnlineRiders();
    if (!tokens.length) return;
    this.pushLog.push({ n: order.id, count: tokens.length });
    if (this.cfg.push.provider !== 'expo') return;
    for (let i = 0; i < tokens.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(tokens.slice(i, i + 100).map((to) => ({ to, title: 'New delivery available', body: `Order ${order.number} · earn ₹${order.earning}`, data: { type: 'order_available', orderId: order.id }, sound: 'default' }))),
        signal: AbortSignal.timeout(8000),
      });
    }
  }

  async #push(n) {
    const tokens = await this.store.pushTokens(n.audience);
    if (!tokens.length) return;
    this.pushLog.push({ n: n.id, count: tokens.length });
    if (this.cfg.push.provider !== 'expo') return;
    for (let i = 0; i < tokens.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(tokens.slice(i, i + 100).map((to) => ({ to, title: n.title, body: n.body, data: n.data, sound: 'default' }))),
        signal: AbortSignal.timeout(8000),
      });
    }
  }
}
