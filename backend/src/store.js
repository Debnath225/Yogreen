import { randomUUID } from 'node:crypto';

/** In-memory storage adapter used by tests and development when MongoDB is not configured. */
export class Store {
  constructor() {
    this.users = new Map();
    this.byPhone = new Map();
    this.riderDocuments = new Map();
    this.sessions = new Map();     // sid -> {id,userId,client,revoked}
    this.refresh = new Map();      // sha256(token) -> {sid,used,expiresAt}
    this.otps = new Map();         // phone -> {hash,expiresAt,attempts,sentAt,sends:[ts]}
    this.products = new Map();
    this.priceHistory = [];
    this.orders = new Map();
    this.ordersByUser = new Map(); // userId -> [orderId]
    this.carts = new Map();        // userId -> [{productId,qty}]
    this.idem = new Map();         // `${userId}:${key}` -> orderId
    this.ledger = new Map();       // userId -> [entries]
    this.notifications = [];       // {id,audience:'all'|userId,title,body,data,createdAt}
    this.devices = new Map();      // userId -> Map(token -> {platform})
    this.riderLedger = new Map();  // riderId -> cash settlement rows
    this.riderEarnings = new Map();// riderId -> completed delivery rows
    this.audit = [];
  }
  id() { return randomUUID(); }
  async findUserByPhone(phone) { return this.userByPhone(phone); }
  async findUser(id) { return this.users.get(id); }
  async insertRiderApplication(user) {
    const sourceDocument = user.application.license.document;
    const documentId = this.id();
    const storedUser = {
      ...user,
      application: {
        ...user.application,
        license: {
          ...user.application.license,
          document: { id: documentId, name: sourceDocument.name, mimeType: sourceDocument.mimeType, size: sourceDocument.content.length },
        },
      },
    };
    await this.insertUser(storedUser);
    this.riderDocuments.set(documentId, { id: documentId, riderId: user.id, ...sourceDocument });
    return storedUser;
  }
  async getRiderLicenseDocument(riderId) {
    const user = await this.findUser(riderId);
    if (!user || user.role !== 'rider') return null;
    const id = user.application?.license?.document?.id;
    return id ? this.riderDocuments.get(id) || null : null;
  }
  async listRiderApplications() {
    return [...this.users.values()]
      .filter((user) => user.role === 'rider' && user.status === 'pending_approval')
      .sort((a, b) => a.appliedAt - b.appliedAt);
  }
  async reviewRiderApplication(id, status, reviewedBy, note) {
    const user = this.users.get(id);
    if (!user || user.role !== 'rider' || user.status !== 'pending_approval') return null;
    Object.assign(user, { status, reviewedBy, reviewNote: note, reviewedAt: Date.now(), online: false });
    return user;
  }
  async insertUser(u) {
    if (this.userByPhone(u.phone)) {
      const error = new Error('Duplicate phone number');
      error.code = 11000;
      throw error;
    }
    return this.addUser(u);
  }
  async createUserIfAbsent(user) { return this.userByPhone(user.phone) || this.addUser(user); }
  async saveUser(user) {
    for (const [phone, id] of this.byPhone) if (id === user.id && phone !== user.phone) this.byPhone.delete(phone);
    this.users.set(user.id, user);
    if (user.status === 'active') this.byPhone.set(user.phone, user.id);
    return user;
  }
  async patchUser(id, patch) {
    const user = this.users.get(id);
    if (!user) return null;
    if (patch.phone !== undefined) {
      for (const [phone, userId] of this.byPhone) if (userId === id && phone !== patch.phone) this.byPhone.delete(phone);
    }
    Object.assign(user, patch);
    if (user.status === 'active') this.byPhone.set(user.phone, id);
    return user;
  }
  async deleteUserDevices(userId) { this.devices.delete(userId); }
  async getCart(userId) { return this.carts.get(userId) || []; }
  async setCart(userId, items) { this.carts.set(userId, structuredClone(items)); return items; }
  async deleteCart(userId) { this.carts.delete(userId); }
  async findSession(id) { return this.sessions.get(id); }
  async saveSession(session) { this.sessions.set(session.id, session); return session; }
  async revokeSessions(userId) {
    for (const session of this.sessions.values()) if (session.userId === userId) session.revoked = true;
  }
  async putRefresh(hash, token) { this.refresh.set(hash, token); }
  async consumeRefresh(hash, now) {
    const token = this.refresh.get(hash);
    if (!token) return { token: null, reason: 'missing' };
    if (token.used) {
      const session = this.sessions.get(token.sid);
      if (session) session.revoked = true;
      return { token, reason: 'used' };
    }
    if (token.expiresAt <= now) return { token, reason: 'expired' };
    token.used = true;
    return { token, reason: null };
  }
  async getOtp(phone) { return this.otps.get(phone); }
  async saveOtp(phone, otp) { this.otps.set(phone, otp); }
  async deleteOtp(phone) { this.otps.delete(phone); }
  async updateOtp(phone, hash, update) {
    const otp = this.otps.get(phone);
    if (!otp || otp.hash !== hash || (update.maxAttempts !== undefined && otp.attempts >= update.maxAttempts)) return false;
    Object.assign(otp, update.set || {});
    for (const [key, amount] of Object.entries(update.inc || {})) otp[key] = (otp[key] || 0) + amount;
    return true;
  }
  async listProducts() { return [...this.products.values()]; }
  async listActiveProducts() {
    return [...this.products.values()].filter((product) => product.active)
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }
  async getProduct(id) { return this.products.get(id); }
  async getProducts(ids) { return ids.map((id) => this.products.get(id)).filter(Boolean); }
  async saveProduct(product) { this.products.set(product.id, product); return product; }
  async updateProduct(id, expectedVersion, patch) {
    const product = this.products.get(id);
    if (!product || product.version !== expectedVersion) return null;
    Object.assign(product, patch, { version: product.version + 1, updatedAt: Date.now() });
    return product;
  }
  async updateProductWithHistory(id, expectedVersion, patch, history, actorId, detail) {
    const product = await this.updateProduct(id, expectedVersion, patch);
    if (!product) return null;
    if (history) this.priceHistory.push(history);
    this.log(actorId, 'product.update', detail);
    return product;
  }
  async seedProductDocuments(products) {
    for (const product of products) {
      if (![...this.products.values()].some((p) => p.sku === product.sku)) this.products.set(product.id, product);
    }
  }
  async recordPriceHistory(entry) { this.priceHistory.push(entry); }
  async listPriceHistory(productId, limit = 100) {
    return this.priceHistory.filter((item) => item.productId === productId).slice(-limit).reverse();
  }
  async appendAudit(actorId, action, detail) { this.log(actorId, action, detail); }
  async getOrder(id) { return this.orders.get(id); }
  async findOrderByIdempotency(userId, key) {
    const id = this.idem.get(`${userId}:${key}`);
    return id ? this.orders.get(id) : null;
  }
  async createOrderAtomic(order, key, stockLines, ledgerEntry) {
    const priorId = this.idem.get(`${order.userId}:${key}`);
    const prior = priorId ? this.orders.get(priorId) : null;
    if (prior) return { order: prior, replayed: true };
    for (const line of stockLines) {
      const product = this.products.get(line.productId);
      if (!product?.active || product.stock < line.qty) throw new Error(`INSUFFICIENT_STOCK:${line.productId}`);
    }
    for (const line of stockLines) {
      const product = this.products.get(line.productId);
      product.stock -= line.qty;
      product.version++;
    }
    if (ledgerEntry) {
      let rows = this.ledger.get(ledgerEntry.userId);
      if (!rows) { rows = []; this.ledger.set(ledgerEntry.userId, rows); }
      const balance = rows.at(-1)?.balanceAfter || 0;
      if (balance + ledgerEntry.amount < 0) throw new Error('INSUFFICIENT_COINS');
      rows.push({ ...ledgerEntry, balanceAfter: balance + ledgerEntry.amount });
    }
    this.orders.set(order.id, order);
    this.ordersByUser.set(order.userId, [...(this.ordersByUser.get(order.userId) || []), order.id]);
    this.idem.set(`${order.userId}:${key}`, order.id);
    return { order, replayed: false };
  }
  async updateOrderAtomic(order, expectedStatus, stockRestores = [], ledgerEntry = null) {
    const current = this.orders.get(order.id);
    if (!current || current.status !== expectedStatus) throw new Error('ORDER_STATE_CHANGED');
    for (const line of stockRestores) {
      const product = this.products.get(line.productId);
      if (product) { product.stock += line.qty; product.version++; }
    }
    if (ledgerEntry) {
      let rows = this.ledger.get(ledgerEntry.userId);
      if (!rows) { rows = []; this.ledger.set(ledgerEntry.userId, rows); }
      if (ledgerEntry.refId && rows.some((row) => row.type === ledgerEntry.type && row.refId === ledgerEntry.refId)) {
        this.orders.set(order.id, order);
        return order;
      }
      const balance = rows.at(-1)?.balanceAfter || 0;
      if (balance + ledgerEntry.amount < 0) throw new Error('INSUFFICIENT_COINS');
      rows.push({ ...ledgerEntry, balanceAfter: balance + ledgerEntry.amount });
    }
    this.orders.set(order.id, order);
    return order;
  }
  async listOrdersForUser(userId, limit = 100) {
    return (this.ordersByUser.get(userId) || []).slice(-limit).reverse().map((id) => this.orders.get(id));
  }
  async listOrders(status, limit = 100) {
    return [...this.orders.values()].filter((order) => !status || order.status === status)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
  async getWallet(userId) {
    const entries = this.ledger.get(userId) || [];
    return { userId, balance: entries.at(-1)?.balanceAfter || 0 };
  }
  async postLedger(entry) {
    let rows = this.ledger.get(entry.userId);
    if (!rows) { rows = []; this.ledger.set(entry.userId, rows); }
    if (entry.refId && rows.some((row) => row.type === entry.type && row.refId === entry.refId)) return null;
    const balance = rows.at(-1)?.balanceAfter || 0;
    if (balance + entry.amount < 0) throw new Error('INSUFFICIENT_COINS');
    const completed = { ...entry, balanceAfter: balance + entry.amount };
    rows.push(completed);
    return completed;
  }
  async claimCheckin(user, checkin, entry) {
    const currentDay = user.checkin?.lastDay;
    if (currentDay === checkin.lastDay) return null;
    let rows = this.ledger.get(entry.userId);
    if (!rows) { rows = []; this.ledger.set(entry.userId, rows); }
    if (entry.refId && rows.some((row) => row.type === entry.type && row.refId === entry.refId)) return null;
    const balance = rows.at(-1)?.balanceAfter || 0;
    rows.push({ ...entry, balanceAfter: balance + entry.amount });
    user.checkin = checkin;
    this.users.set(user.id, user);
    return { balance: balance + entry.amount };
  }
  async ledgerHistory(userId, before, limit) {
    let rows = [...(this.ledger.get(userId) || [])].reverse();
    if (before) rows = rows.filter((entry) => entry.at < before);
    const items = rows.slice(0, limit);
    return { items, nextBefore: rows.length > limit ? items.at(-1).at : null };
  }
  async createNotification(notification) {
    this.notifications.push(notification);
    if (this.notifications.length > 5000) this.notifications.shift();
    return notification;
  }
  async listNotifications(userId, limit = 30) {
    return this.notifications.filter((item) => item.audience === 'all' || item.audience === userId).slice(-limit).reverse();
  }
  async upsertDevice(userId, token, platform, at) {
    const devices = this.devices.get(userId) || new Map();
    if (devices.size >= 10 && !devices.has(token)) devices.delete(devices.keys().next().value);
    devices.set(token, { platform, at });
    this.devices.set(userId, devices);
  }
  async listDevices(userId) { return [...(this.devices.get(userId)?.entries() || [])].map(([token, device]) => ({ token, ...device })); }
  async listUsersWithDevices() { return [...this.devices.keys()]; }
  async pushTokens(audience) {
    const userIds = audience === 'all' ? this.devices.keys() : [audience];
    const tokens = [];
    for (const userId of userIds) {
      const user = this.users.get(userId);
      if (!user || user.prefs?.pushEnabled === false) continue;
      for (const token of this.devices.get(userId)?.keys() || []) tokens.push(token);
    }
    return tokens;
  }
  async pushTokensForOnlineRiders() {
    const tokens = [];
    for (const user of this.users.values()) {
      if (user.role !== 'rider' || user.status !== 'active' || !user.online || user.prefs?.pushEnabled === false) continue;
      for (const token of this.devices.get(user.id)?.keys() || []) tokens.push(token);
    }
    return tokens;
  }
  async setRiderOnline(userId, online) {
    const user = await this.findUser(userId);
    if (!user || user.role !== 'rider') return null;
    user.online = online;
    return user;
  }
  async listRiderOrders(riderId, scope) {
    const orders = [...this.orders.values()];
    if (scope === 'available') return orders.filter((o) => o.status === 'packed' && !o.riderId).sort((a, b) => a.createdAt - b.createdAt);
    if (scope === 'active') return orders.filter((o) => o.riderId === riderId && ['packed', 'out_for_delivery'].includes(o.status)).sort((a, b) => a.createdAt - b.createdAt);
    return orders.filter((o) => o.riderId === riderId && o.status === 'delivered').sort((a, b) => b.createdAt - a.createdAt);
  }
  async claimRiderOrder(id, riderId, maxActive) {
    const rider = await this.findUser(riderId);
    if (!rider?.online) return { order: null, reason: 'rider_offline' };
    if ((await this.listRiderOrders(riderId, 'active')).length >= maxActive) return { order: null, reason: 'too_many_active' };
    const order = await this.getOrder(id);
    if (!order || order.status !== 'packed' || order.riderId) return { order: null, reason: 'order_unavailable' };
    order.riderId = riderId;
    order.history.push({ status: 'packed', at: Date.now(), by: riderId });
    return { order };
  }
  async releaseRiderOrder(id, riderId) {
    const order = await this.getOrder(id);
    if (!order || order.riderId !== riderId || order.status !== 'packed') return null;
    order.riderId = null;
    order.history.push({ status: 'packed', at: Date.now(), by: riderId, action: 'released' });
    return order;
  }
  async assignRiderOrder(id, riderId) {
    const order = await this.getOrder(id);
    if (!order || order.status !== 'packed' || order.riderId) return null;
    order.riderId = riderId;
    order.history.push({ status: 'packed', at: Date.now(), by: riderId, action: 'assigned' });
    return order;
  }
  async incrementDeliveryCodeAttempts(id, riderId) {
    const order = await this.getOrder(id);
    if (!order || order.riderId !== riderId) return 0;
    order.codeAttempts = (order.codeAttempts || 0) + 1;
    return order.codeAttempts;
  }
  async recordRiderEarning(entry) {
    const rows = this.riderEarnings.get(entry.riderId) || [];
    if (rows.some((row) => row.orderId === entry.orderId)) return;
    rows.push(entry);
    this.riderEarnings.set(entry.riderId, rows);
    const rider = await this.findUser(entry.riderId);
    rider.cashHeld = (rider.cashHeld || 0) + entry.cash;
  }
  async listRiderEarnings(riderId) { return [...(this.riderEarnings.get(riderId) || [])].sort((a, b) => b.at - a.at); }
  async settleRiderCash(entry) {
    const rider = await this.findUser(entry.riderId);
    if (!rider || entry.amount <= 0 || entry.amount > (rider.cashHeld || 0)) return false;
    rider.cashHeld -= entry.amount;
    const rows = this.riderLedger.get(entry.riderId) || [];
    rows.push(entry);
    this.riderLedger.set(entry.riderId, rows);
    return true;
  }
  addUser(u) {
    const user = { id: this.id(), status: 'active', setupCompleted: false, createdAt: Date.now(), notifReadAt: 0, addresses: [], prefs: { language: 'en', pushEnabled: true }, ...u };
    this.users.set(user.id, user);
    this.byPhone.set(user.phone, user.id);
    return user;
  }
  userByPhone(phone) { const id = this.byPhone.get(phone); return id ? this.users.get(id) : undefined; }
  log(actorId, action, detail) { this.audit.push({ at: Date.now(), actorId, action, detail }); if (this.audit.length > 10_000) this.audit.shift(); }
}

const P = (sku, name, category, unit, price, mrp, stock, emoji) => ({ sku, name, category, unit, price, mrp, stock, emoji });
export const SEED_PRODUCTS = [
  P('VEG-TOM', 'Desi Tomato', 'Vegetables', 'kg', 38, 48, 120, '🍅'),
  P('VEG-POT', 'Potato', 'Vegetables', 'kg', 28, 34, 300, '🥔'),
  P('VEG-ONI', 'Red Onion', 'Vegetables', 'kg', 36, 44, 250, '🧅'),
  P('VEG-BRI', 'Brinjal (Round)', 'Vegetables', 'kg', 52, 64, 80, '🍆'),
  P('VEG-CAU', 'Cauliflower', 'Vegetables', 'pc', 45, 55, 70, '🥦'),
  P('VEG-CHI', 'Green Chilli', 'Vegetables', 'kg', 90, 110, 40, '🌶️'),
  P('VEG-CAR', 'Carrot', 'Vegetables', 'kg', 58, 70, 90, '🥕'),
  P('LEA-SPI', 'Palak (Spinach)', 'Leafy Greens', 'bunch', 18, 25, 100, '🥬'),
  P('LEA-COR', 'Coriander', 'Leafy Greens', 'bunch', 15, 20, 120, '🌿'),
  P('LEA-MET', 'Methi (Fenugreek)', 'Leafy Greens', 'bunch', 20, 28, 60, '🌱'),
  P('FRU-BAN', 'Banana (Kanthali)', 'Fruits', 'dozen', 60, 75, 80, '🍌'),
  P('FRU-APP', 'Apple (Shimla)', 'Fruits', 'kg', 160, 190, 60, '🍎'),
  P('FRU-LEM', 'Lemon (Gondhoraj)', 'Fruits', 'pc', 8, 12, 300, '🍋'),
  P('EXO-BRO', 'Broccoli', 'Exotics', 'pc', 70, 85, 40, '🥦'),
  P('STA-RIC', 'Miniket Rice 5kg', 'Staples', 'pc', 310, 360, 100, '🍚'),
  P('STA-DAL', 'Masoor Dal 1kg', 'Staples', 'pc', 98, 115, 150, '🫘'),
];

export async function seedPersistentProducts(store) {
  const products = SEED_PRODUCTS.map((product) => ({
    id: store.id(), ...product, active: true, version: 1, updatedAt: Date.now(),
  }));
  await store.seedProductDocuments(products);
}
