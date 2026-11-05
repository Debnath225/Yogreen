import { generateKeyPairSync } from 'node:crypto';

const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));
const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true');

/** Builds config from env. `overrides` is used by tests. */
export function loadConfig(overrides = {}) {
  const env = process.env;
  const nodeEnv = overrides.nodeEnv ?? env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';
  const cfg = {
    isProd,
    isTest: nodeEnv === 'test',
    port: int(env.PORT, 4000),
    mongo: {
      enabled: bool(env.MONGODB_ENABLED, isProd),
      uri: env.MONGODB_URI || '',
      database: env.MONGODB_DB || 'yogreen',
    },
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: bool(env.TRUST_PROXY, false),
    superAdminPhone: env.SUPERADMIN_PHONE || '',
    sms: { provider: env.SMS_PROVIDER || 'console', url: env.SMS_WEBHOOK_URL, token: env.SMS_WEBHOOK_TOKEN },
    push: { provider: env.PUSH_PROVIDER || 'console' },
    otp: {
      secret: env.OTP_SECRET || 'dev-only-otp-secret',
      ttlMs: 5 * 60_000,
      maxAttempts: 5,
      resendCooldownMs: 30_000,
      maxSendsPerHour: 5,
      exposeDev: bool(env.EXPOSE_DEV_OTP, !isProd),
    },
    jwt: {
      issuer: 'yogreen-api',
      audience: 'yogreen-clients',
      accessTtlSec: 15 * 60,
      refreshTtlSec: 30 * 24 * 3600,
      privateKey: env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      publicKey: env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n'),
    },
    ygc: { valueInr: 1, earnRate: 0.02, signupBonus: 50, maxRedeemPct: 0.10, checkinBase: 2, checkinStreakCap: 7 },
    delivery: { minOrder: 99, freeAbove: 299, fee: 25 },
    limits: { globalPerMin: 240, authPerMin: 20, bodyBytes: 64 * 1024 },
  };
  deepMerge(cfg, overrides);
  if (!cfg.jwt.privateKey || !cfg.jwt.publicKey) {
    if (cfg.isProd) throw new Error('JWT_PRIVATE_KEY / JWT_PUBLIC_KEY are required in production');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    cfg.jwt.privateKey = privateKey;
    cfg.jwt.publicKey = publicKey;
  }
  if (cfg.isProd) {
    if (!cfg.mongo.uri) throw new Error('MONGODB_URI is required in production');
    if (!cfg.mongo.enabled) throw new Error('MONGODB_ENABLED must be true in production');
    if (!env.OTP_SECRET || env.OTP_SECRET.length < 32) throw new Error('OTP_SECRET (>=32 chars) is required in production');
    if (cfg.otp.exposeDev) throw new Error('EXPOSE_DEV_OTP must be false in production');
    if (cfg.sms.provider === 'console') throw new Error('Configure a real SMS_PROVIDER in production');
  }
  return cfg;
}

function deepMerge(t, s) {
  for (const k of Object.keys(s)) {
    if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k]) deepMerge(t[k], s[k]);
    else if (k !== 'nodeEnv') t[k] = s[k];
  }
}
