import { HttpError } from '../lib/http.js';

/** YGC coin ledger: append-only, balanceAfter recorded on every entry. */
export class Wallet {
  constructor(cfg, store) { this.cfg = cfg; this.store = store; }

  async balance(userId) {
    return (await this.store.getWallet(userId)).balance;
  }

  createEntry(userId, type, amount, reason, refId = null) {
    return { id: this.store.id(), userId, type, amount, reason, refId, at: Date.now() };
  }

  /** type: bonus | earn | redeem | refund | checkin. amount signed integer. Idempotent per (type, refId). */
  async post(userId, type, amount, reason, refId = null) {
    const entry = this.createEntry(userId, type, amount, reason, refId);
    try {
      return await this.store.postLedger(entry);
    } catch (error) {
      if (error.message === 'INSUFFICIENT_COINS') throw new HttpError(409, 'insufficient_coins', 'Not enough YGC coins');
      throw error;
    }
  }

  async history(userId, { before, limit = 20 } = {}) {
    return this.store.ledgerHistory(userId, before, limit);
  }

  /** Daily check-in with IST day boundary and streak bonus. */
  async checkin(user) {
    const IST = 5.5 * 3600_000;
    const day = (t) => Math.floor((t + IST) / 86_400_000);
    const today = day(Date.now());
    const c = user.checkin || { lastDay: -1, streak: 0 };
    if (c.lastDay === today) throw new HttpError(409, 'already_checked_in', 'Already claimed today');
    const streak = c.lastDay === today - 1 ? c.streak + 1 : 1;
    const amount = this.cfg.ygc.checkinBase + Math.min(streak, this.cfg.ygc.checkinStreakCap) - 1;
    const entry = this.createEntry(user.id, 'checkin', amount, `Day ${streak} check-in`, `day-${today}`);
    const result = await this.store.claimCheckin(user, { lastDay: today, streak }, entry);
    if (!result) throw new HttpError(409, 'already_checked_in', 'Already claimed today');
    return { earned: amount, streak, balance: result.balance };
  }

  async summary(user) {
    const wallet = await this.store.getWallet(user.id);
    const c = user.checkin;
    const today = Math.floor((Date.now() + 5.5 * 3600_000) / 86_400_000);
    return {
      balance: wallet.balance,
      valueInr: wallet.balance * this.cfg.ygc.valueInr,
      streak: c && c.lastDay >= today - 1 ? c.streak : 0,
      checkedInToday: !!c && c.lastDay === today,
    };
  }
}
