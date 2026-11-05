import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { UserRepository } from './repositories/users.js';
import { RiderApplicationsRepository } from './repositories/rider-applications.js';

const INDEXES = {
  users: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { phone: 1 }, options: { unique: true } },
    { key: { role: 1, status: 1 } },
  ],
  sessions: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { userId: 1, revoked: 1 } },
  ],
  refreshTokens: [
    { key: { hash: 1 }, options: { unique: true } },
    { key: { expiresOn: 1 }, options: { expireAfterSeconds: 0 } },
    { key: { sid: 1 } },
  ],
  otps: [
    { key: { phone: 1 }, options: { unique: true } },
    { key: { expiresOn: 1 }, options: { expireAfterSeconds: 0 } },
  ],
  products: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { sku: 1 }, options: { unique: true } },
    { key: { active: 1, category: 1, name: 1 } },
  ],
  priceHistory: [
    { key: { productId: 1, at: -1 } },
  ],
  orders: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { userId: 1, createdAt: -1, id: -1 } },
    { key: { status: 1, createdAt: -1, id: -1 } },
    { key: { createdAt: -1, id: -1 } },
    { key: { riderId: 1, status: 1, createdAt: -1 } },
  ],
  carts: [
    { key: { userId: 1 }, options: { unique: true } },
  ],
  idempotency: [
    { key: { userId: 1, key: 1 }, options: { unique: true } },
  ],
  wallets: [
    { key: { userId: 1 }, options: { unique: true } },
  ],
  ledger: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { userId: 1, at: -1, id: -1 } },
    { key: { userId: 1, type: 1, refId: 1 }, options: { unique: true, partialFilterExpression: { refId: { $type: 'string' } } } },
  ],
  notifications: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { audience: 1, createdAt: -1 } },
    { key: { expiresOn: 1 }, options: { expireAfterSeconds: 0 } },
  ],
  devices: [
    { key: { userId: 1, token: 1 }, options: { unique: true } },
    { key: { userId: 1, at: 1 } },
  ],
  riderEarnings: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { riderId: 1, orderId: 1 }, options: { unique: true } },
    { key: { riderId: 1, at: -1 } },
  ],
  riderLedger: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { riderId: 1, at: -1 } },
  ],
  audit: [
    { key: { at: -1 } },
    { key: { actorId: 1, at: -1 } },
  ],
  riderDocuments: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { riderId: 1 }, options: { unique: true } },
  ],
};

const COLLECTIONS = Object.keys(INDEXES);

export class MongoStore {
  constructor({ uri, database }) {
    this.client = new MongoClient(uri, {
      appName: 'yogreen-backend',
      maxPoolSize: 50,
      minPoolSize: 2,
      retryWrites: true,
      serverSelectionTimeoutMS: 5000,
    });
    this.databaseName = database;
  }

  id() {
    return randomUUID();
  }

  async connect() {
    try {
      await this.client.connect();
      this.db = this.client.db(this.databaseName);
      this.userRepository = new UserRepository(this.db);
      this.riderApplicationsRepository = new RiderApplicationsRepository(this.db, this.client, this.userRepository);
      const topology = await this.db.admin().command({ hello: 1 });
      if (!topology.setName && topology.msg !== 'isdbgrid') {
        throw new Error('MongoDB replica set or sharded cluster is required for transactional operations');
      }
      await Promise.all(COLLECTIONS.map((name) => {
        const specs = INDEXES[name].map(({ key, options }) => ({ key, ...options }));
        return this.db.collection(name).createIndexes(specs);
      }));
    } catch (error) {
      await this.client.close();
      throw error;
    }
  }

  async close() {
    await this.client.close();
  }

  collection(name) {
    return this.db.collection(name);
  }

  async findUserByPhone(phone) {
    return this.userRepository.findByPhone(phone);
  }

  async findUser(id) {
    return this.userRepository.findById(id);
  }

  async listRiderApplications() {
    return this.riderApplicationsRepository.list();
  }

  async reviewRiderApplication(id, status, reviewedBy, note) {
    return this.riderApplicationsRepository.review(id, status, reviewedBy, note);
  }

  async insertRiderApplication(user) {
    return this.riderApplicationsRepository.create(user, this.id());
  }

  async getRiderLicenseDocument(riderId) {
    return this.riderApplicationsRepository.getLicenseDocument(riderId);
  }

  async insertUser(user) {
    return this.userRepository.insert(user);
  }

  async createUserIfAbsent(user) {
    return this.userRepository.createIfAbsent(user);
  }

  async saveUser(user) {
    return this.userRepository.save(user);
  }

  async patchUser(id, patch) {
    return this.userRepository.patch(id, patch);
  }

  async deleteUserDevices(userId) {
    await this.collection('devices').deleteMany({ userId });
  }

  async getCart(userId) {
    const cart = await this.collection('carts').findOne({ userId }, { projection: { _id: 0, items: 1 } });
    return cart?.items || [];
  }

  async setCart(userId, items) {
    await this.collection('carts').replaceOne({ userId }, { userId, items, updatedAt: Date.now() }, { upsert: true });
    return items;
  }

  async deleteCart(userId) {
    await this.collection('carts').deleteOne({ userId });
  }

  async findSession(id) {
    return this.collection('sessions').findOne({ id }, { projection: { _id: 0 } });
  }

  async saveSession(session) {
    await this.collection('sessions').replaceOne({ id: session.id }, session, { upsert: true });
    return session;
  }

  async revokeSessions(userId) {
    await this.collection('sessions').updateMany({ userId }, { $set: { revoked: true } });
  }

  async putRefresh(hash, token) {
    await this.collection('refreshTokens').replaceOne(
      { hash },
      { hash, ...token, expiresOn: new Date(token.expiresAt) },
      { upsert: true },
    );
  }

  async consumeRefresh(hash, now) {
    const tokens = this.collection('refreshTokens');
    const token = await tokens.findOne({ hash }, { projection: { _id: 0 } });
    if (!token) return { token: null, reason: 'missing' };
    if (token.used) {
      await this.collection('sessions').updateOne({ id: token.sid }, { $set: { revoked: true } });
      return { token, reason: 'used' };
    }
    if (token.expiresAt <= now) return { token, reason: 'expired' };
    const result = await tokens.updateOne({ hash, used: false, expiresAt: { $gt: now } }, { $set: { used: true } });
    if (!result.modifiedCount) return this.consumeRefresh(hash, now);
    return { token: { ...token, used: true }, reason: null };
  }

  async getOtp(phone) {
    return this.collection('otps').findOne({ phone }, { projection: { _id: 0 } });
  }

  async saveOtp(phone, otp) {
    await this.collection('otps').replaceOne(
      { phone },
      { phone, ...otp, expiresOn: new Date(otp.expiresAt || Date.now()) },
      { upsert: true },
    );
  }

  async deleteOtp(phone) {
    await this.collection('otps').deleteOne({ phone });
  }

  async updateOtp(phone, hash, update) {
    const filter = { phone, hash };
    if (update.maxAttempts !== undefined) filter.attempts = { $lt: update.maxAttempts };
    const result = await this.collection('otps').updateOne(
      filter,
      { $set: update.set || {}, ...(update.inc ? { $inc: update.inc } : {}) },
    );
    return result.modifiedCount === 1;
  }

  async listProducts() {
    return this.collection('products').find({}, { projection: { _id: 0 } }).toArray();
  }

  async listActiveProducts() {
    return this.collection('products').find({ active: true }, { projection: { _id: 0 } })
      .sort({ category: 1, name: 1 }).toArray();
  }

  async getProduct(id) {
    return this.collection('products').findOne({ id }, { projection: { _id: 0 } });
  }

  async getProducts(ids) {
    return this.collection('products').find({ id: { $in: ids } }, { projection: { _id: 0 } }).toArray();
  }

  async saveProduct(product) {
    await this.collection('products').replaceOne({ id: product.id }, product, { upsert: true });
    return product;
  }

  async updateProduct(id, expectedVersion, patch) {
    return this.collection('products').findOneAndUpdate(
      { id, version: expectedVersion },
      { $set: { ...patch, updatedAt: Date.now() }, $inc: { version: 1 } },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
  }

  async updateProductWithHistory(id, expectedVersion, patch, history, actorId, detail) {
    const session = this.client.startSession();
    try {
      let updated = null;
      await session.withTransaction(async () => {
        updated = await this.collection('products').findOneAndUpdate(
          { id, version: expectedVersion },
          { $set: { ...patch, updatedAt: Date.now() }, $inc: { version: 1 } },
          { session, returnDocument: 'after', projection: { _id: 0 } },
        );
        if (!updated) return;
        if (history) await this.collection('priceHistory').insertOne(history, { session });
        await this.collection('audit').insertOne({ at: Date.now(), actorId, action: 'product.update', detail }, { session });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return updated;
    } finally {
      await session.endSession();
    }
  }

  async seedProducts(products) {
    await this.collection('products').bulkWrite(products.map((product) => ({
      updateOne: {
        filter: { sku: product.sku },
        update: { $setOnInsert: product },
        upsert: true,
      },
    })), { ordered: false });
  }

  async seedProductDocuments(products) {
    return this.seedProducts(products);
  }

  async recordPriceHistory(entry) {
    await this.collection('priceHistory').insertOne(entry);
  }

  async listPriceHistory(productId, limit = 100) {
    return this.collection('priceHistory').find({ productId }, { projection: { _id: 0 } })
      .sort({ at: -1 }).limit(limit).toArray();
  }

  async log(actorId, action, detail) {
    await this.collection('audit').insertOne({ at: Date.now(), actorId, action, detail });
  }

  async appendAudit(actorId, action, detail) {
    return this.log(actorId, action, detail);
  }

  async getOrder(id) {
    return this.collection('orders').findOne({ id }, { projection: { _id: 0 } });
  }

  async findOrderByIdempotency(userId, key) {
    const entry = await this.collection('idempotency').findOne({ userId, key }, { projection: { orderId: 1 } });
    return entry ? this.getOrder(entry.orderId) : null;
  }

  async createOrderAtomic(order, key, stockLines, ledgerEntry) {
    const session = this.client.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const idem = this.collection('idempotency');
        const existing = await idem.findOne({ userId: order.userId, key }, { session });
        if (existing) {
          result = { order: await this.collection('orders').findOne({ id: existing.orderId }, { session, projection: { _id: 0 } }), replayed: true };
          return;
        }
        const stockUpdate = await this.collection('products').bulkWrite(stockLines.map((line) => ({
          updateOne: {
            filter: { id: line.productId, active: true, stock: { $gte: line.qty } },
            update: { $inc: { stock: -line.qty, version: 1 } },
          },
        })), { session, ordered: false });
        if (stockUpdate.matchedCount !== stockLines.length) {
          for (const line of stockLines) {
            const product = await this.collection('products').findOne({ id: line.productId }, { session });
            if (!product?.active || product.stock < line.qty) throw new Error(`INSUFFICIENT_STOCK:${line.productId}`);
          }
          throw new Error('INSUFFICIENT_STOCK');
        }
        if (ledgerEntry) await this.applyLedger(ledgerEntry, session);
        await this.collection('orders').insertOne({ ...order }, { session });
        await idem.insertOne({ userId: order.userId, key, orderId: order.id, createdAt: Date.now() }, { session });
        result = { order, replayed: false };
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return result;
    } catch (error) {
      if (error.code === 11000) {
        const existing = await this.findOrderByIdempotency(order.userId, key);
        if (existing) return { order: existing, replayed: true };
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async updateOrderAtomic(order, expectedStatus, stockRestores = [], ledgerEntry = null) {
    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await this.collection('orders').replaceOne({ id: order.id, status: expectedStatus }, order, { session });
        if (!result.modifiedCount) throw new Error('ORDER_STATE_CHANGED');
        for (const line of stockRestores) {
          await this.collection('products').updateOne(
            { id: line.productId },
            { $inc: { stock: line.qty, version: 1 } },
            { session },
          );
        }
        if (ledgerEntry) await this.applyLedger(ledgerEntry, session);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return order;
    } finally {
      await session.endSession();
    }
  }

  async listOrdersForUser(userId, limit = 100) {
    return this.collection('orders').find({ userId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1, id: -1 }).limit(limit).toArray();
  }

  async listOrders(status, limit = 100) {
    return this.collection('orders').find(status ? { status } : {}, { projection: { _id: 0 } })
      .sort({ createdAt: -1, id: -1 }).limit(limit).toArray();
  }

  async pushTokensForOnlineRiders() {
    const riders = await this.collection('users').find(
      { role: 'rider', status: 'active', online: true, 'prefs.pushEnabled': { $ne: false } },
      { projection: { id: 1 } },
    ).toArray();
    if (!riders.length) return [];
    return this.collection('devices').find({ userId: { $in: riders.map((r) => r.id) } }, { projection: { token: 1 } })
      .map((device) => device.token).toArray();
  }

  async setRiderOnline(userId, online) {
    return this.collection('users').findOneAndUpdate(
      { id: userId, role: 'rider', status: 'active' },
      { $set: { online } },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
  }

  async listRiderOrders(riderId, scope) {
    const filter = scope === 'available'
      ? { status: 'packed', $or: [{ riderId: null }, { riderId: { $exists: false } }] }
      : scope === 'active'
        ? { riderId, status: { $in: ['packed', 'out_for_delivery'] } }
        : { riderId, status: 'delivered' };
    const sort = scope === 'done' ? { createdAt: -1 } : { createdAt: 1 };
    return this.collection('orders').find(filter, { projection: { _id: 0 } }).sort(sort).limit(100).toArray();
  }

  async claimRiderOrder(id, riderId, maxActive) {
    const session = this.client.startSession();
    try {
      let result = { order: null, reason: 'order_unavailable' };
      await session.withTransaction(async () => {
        const riderUpdate = await this.collection('users').updateOne(
          { id: riderId, role: 'rider', status: 'active', online: true },
          { $inc: { riderClaimVersion: 1 } },
          { session },
        );
        if (!riderUpdate.modifiedCount) { result = { order: null, reason: 'rider_offline' }; return; }
        const active = await this.collection('orders').countDocuments(
          { riderId, status: { $in: ['packed', 'out_for_delivery'] } },
          { session },
        );
        if (active >= maxActive) { result = { order: null, reason: 'too_many_active' }; return; }
        const order = await this.collection('orders').findOneAndUpdate(
          { id, status: 'packed', $or: [{ riderId: null }, { riderId: { $exists: false } }] },
          { $set: { riderId }, $push: { history: { status: 'packed', at: Date.now(), by: riderId } } },
          { session, returnDocument: 'after', projection: { _id: 0 } },
        );
        if (order) result = { order };
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return result;
    } finally { await session.endSession(); }
  }

  async releaseRiderOrder(id, riderId) {
    return this.collection('orders').findOneAndUpdate(
      { id, riderId, status: 'packed' },
      { $set: { riderId: null }, $push: { history: { status: 'packed', at: Date.now(), by: riderId, action: 'released' } } },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
  }

  async assignRiderOrder(id, riderId) {
    return this.collection('orders').findOneAndUpdate(
      { id, status: 'packed', $or: [{ riderId: null }, { riderId: { $exists: false } }] },
      { $set: { riderId }, $push: { history: { status: 'packed', at: Date.now(), by: riderId, action: 'assigned' } } },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
  }

  async incrementDeliveryCodeAttempts(id, riderId) {
    const order = await this.collection('orders').findOneAndUpdate(
      { id, riderId, status: 'out_for_delivery', codeAttempts: { $lt: 5 } },
      { $inc: { codeAttempts: 1 } },
      { returnDocument: 'after', projection: { _id: 0, codeAttempts: 1 } },
    );
    return order?.codeAttempts || 5;
  }

  async recordRiderEarning(entry) {
    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        const prior = await this.collection('riderEarnings').findOne({ riderId: entry.riderId, orderId: entry.orderId }, { session });
        if (prior) return;
        await this.collection('riderEarnings').insertOne(entry, { session });
        if (entry.cash) await this.collection('users').updateOne({ id: entry.riderId }, { $inc: { cashHeld: entry.cash } }, { session });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) {
      if (error.code !== 11000) throw error;
    } finally { await session.endSession(); }
  }

  async listRiderEarnings(riderId) {
    return this.collection('riderEarnings').find({ riderId }, { projection: { _id: 0 } })
      .sort({ at: -1 }).limit(1000).toArray();
  }

  async settleRiderCash(entry) {
    const session = this.client.startSession();
    try {
      let settled = false;
      await session.withTransaction(async () => {
        const updated = await this.collection('users').updateOne(
          { id: entry.riderId, role: 'rider', cashHeld: { $gte: entry.amount } },
          { $inc: { cashHeld: -entry.amount } },
          { session },
        );
        if (!updated.modifiedCount) return;
        await this.collection('riderLedger').insertOne(entry, { session });
        settled = true;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return settled;
    } finally { await session.endSession(); }
  }

  async getWallet(userId) {
    return (await this.collection('wallets').findOne({ userId }, { projection: { _id: 0 } })) || { userId, balance: 0 };
  }

  async claimCheckin(user, checkin, entry) {
    const session = this.client.startSession();
    try {
      let result = null;
      await session.withTransaction(async () => {
        const filter = { id: user.id };
        if (user.checkin) filter['checkin.lastDay'] = user.checkin.lastDay;
        else filter.checkin = { $exists: false };
        const update = await this.collection('users').updateOne(filter, { $set: { checkin } }, { session });
        if (!update.modifiedCount) return;
        await this.applyLedger(entry, session);
        const wallet = await this.collection('wallets').findOne({ userId: user.id }, { session });
        user.checkin = checkin;
        result = { balance: wallet.balance };
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async applyLedger(entry, session) {
    const ledger = this.collection('ledger');
    if (entry.refId !== null) {
      const prior = await ledger.findOne({ userId: entry.userId, type: entry.type, refId: entry.refId }, { session });
      if (prior) return null;
    }
    const wallets = this.collection('wallets');
    await wallets.updateOne({ userId: entry.userId }, { $setOnInsert: { userId: entry.userId, balance: 0 } }, { upsert: true, session });
    const walletFilter = { userId: entry.userId, ...(entry.amount < 0 ? { balance: { $gte: -entry.amount } } : {}) };
    const updated = await wallets.findOneAndUpdate(
      walletFilter,
      { $inc: { balance: entry.amount } },
      { session, returnDocument: 'after', projection: { _id: 0 } },
    );
    if (!updated) throw new Error('INSUFFICIENT_COINS');
    const complete = { ...entry, balanceAfter: updated.balance };
    await ledger.insertOne(complete, { session });
    return complete;
  }

  async postLedger(entry) {
    const session = this.client.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await this.applyLedger(entry, session);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async ledgerHistory(userId, before, limit) {
    const query = { userId, ...(before ? { at: { $lt: before } } : {}) };
    const rows = await this.collection('ledger').find(query, { projection: { _id: 0 } })
      .sort({ at: -1, id: -1 }).limit(limit + 1).toArray();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return { items, nextBefore: hasMore ? items.at(-1).at : null };
  }

  async createNotification(notification) {
    await this.collection('notifications').insertOne({
      ...notification,
      expiresOn: new Date(Date.now() + 180 * 24 * 60 * 60_000),
    });
    return notification;
  }

  async listNotifications(userId, limit = 30) {
    return this.collection('notifications').find(
      { audience: { $in: ['all', userId] } },
      { projection: { _id: 0, expiresOn: 0 } },
    ).sort({ createdAt: -1, id: -1 }).limit(limit).toArray();
  }

  async upsertDevice(userId, token, platform, at) {
    const devices = this.collection('devices');
    await devices.updateOne({ userId, token }, { $set: { platform, at } }, { upsert: true });
    const excess = await devices.find({ userId }).sort({ at: -1 }).skip(10).project({ _id: 1 }).toArray();
    if (excess.length) await devices.deleteMany({ _id: { $in: excess.map((d) => d._id) } });
  }

  async listDevices(userId) {
    return this.collection('devices').find({ userId }, { projection: { _id: 0 } }).toArray();
  }

  async listUsersWithDevices() {
    return this.collection('devices').distinct('userId');
  }

  async pushTokens(audience) {
    if (audience !== 'all') {
      const user = await this.findUser(audience);
      if (!user || user.prefs?.pushEnabled === false) return [];
      return this.collection('devices').distinct('token', { userId: audience });
    }
    return this.collection('devices').aggregate([
      { $lookup: { from: 'users', localField: 'userId', foreignField: 'id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.prefs.pushEnabled': { $ne: false } } },
      { $group: { _id: '$token' } },
      { $project: { _id: 0, token: '$_id' } },
    ]).map((doc) => doc.token).toArray();
  }
}

export { INDEXES as MONGO_INDEXES };
