import { randomInt } from 'node:crypto';
import { hmac, safeEqual } from '../lib/crypto.js';
import { HttpError } from '../lib/http.js';

export class SmsGateway {
  constructor(cfg) { this.cfg = cfg; this.outbox = []; }
  async send(phone, text) {
    if (this.cfg.sms.provider === 'webhook') {
      const r = await fetch(this.cfg.sms.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.sms.token}` },
        body: JSON.stringify({ to: phone, message: text }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new HttpError(502, 'sms_failed', 'Could not send OTP, try again');
      return;
    }
    this.outbox.push({ phone, text }); // console/dev provider; never used in production (config refuses)
    if (!this.cfg.isProd && process.env.NODE_ENV !== 'test') console.log(`[sms:dev] ${phone}: ${text}`);
  }
}

export class OtpService {
  constructor(cfg, store, sms) { this.cfg = cfg; this.store = store; this.sms = sms; }
  #hash(phone, otp) { return hmac(this.cfg.otp.secret, `${phone}:${otp}`); }

  async send(phone) {
    const o = this.cfg.otp;
    const now = Date.now();
    const rec = await this.store.getOtp(phone) || { sends: [] };
    rec.sends = rec.sends.filter((t) => now - t < 3600_000);
    if (rec.sentAt && now - rec.sentAt < o.resendCooldownMs) {
      throw new HttpError(429, 'otp_cooldown', 'Please wait before requesting another OTP', { retryAfter: Math.ceil((o.resendCooldownMs - (now - rec.sentAt)) / 1000) });
    }
    if (rec.sends.length >= o.maxSendsPerHour) throw new HttpError(429, 'otp_limit', 'Too many OTP requests. Try again later.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    rec.hash = this.#hash(phone, code);
    rec.expiresAt = now + o.ttlMs;
    rec.attempts = 0;
    rec.sentAt = now;
    rec.sends.push(now);
    await this.store.saveOtp(phone, rec);
    await this.sms.send(phone, `${code} is your YoGreen verification code. Valid for 5 minutes. Do not share it with anyone.`);
    return { resendIn: Math.ceil(o.resendCooldownMs / 1000), expiresIn: Math.ceil(o.ttlMs / 1000), ...(o.exposeDev ? { devOtp: code } : {}) };
  }

  /** Constant-time compare, attempt-limited, single use. */
  async verify(phone, code) {
    const rec = await this.store.getOtp(phone);
    const fail = () => new HttpError(401, 'invalid_otp', 'Invalid or expired OTP');
    if (!rec || !rec.hash || rec.expiresAt < Date.now()) throw fail();
    if (rec.attempts >= this.cfg.otp.maxAttempts) { await this.store.deleteOtp(phone); throw new HttpError(429, 'otp_attempts', 'Too many wrong attempts. Request a new OTP.'); }
    if (!/^\d{6}$/.test(code) || !safeEqual(this.#hash(phone, code), rec.hash)) {
      await this.store.updateOtp(phone, rec.hash, { inc: { attempts: 1 }, maxAttempts: this.cfg.otp.maxAttempts });
      throw fail();
    }
    if (!await this.store.updateOtp(phone, rec.hash, { set: { hash: null } })) throw fail();
    return true;
  }
}
