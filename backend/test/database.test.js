import test from 'node:test';
import assert from 'node:assert/strict';
import { MONGO_INDEXES } from '../src/db/mongo.js';
import { loadConfig } from '../src/config.js';

const index = (collection, fields) => MONGO_INDEXES[collection].find((spec) =>
  JSON.stringify(Object.keys(spec.key)) === JSON.stringify(fields),
);

test('MongoDB indexes cover the backend hot queries and uniqueness constraints', () => {
  assert.equal(index('users', ['phone']).options.unique, true);
  assert.equal(index('refreshTokens', ['hash']).options.unique, true);
  assert.equal(index('products', ['sku']).options.unique, true);
  assert.ok(index('orders', ['userId', 'createdAt', 'id']));
  assert.ok(index('orders', ['status', 'createdAt', 'id']));
  assert.equal(index('idempotency', ['userId', 'key']).options.unique, true);
  assert.ok(index('ledger', ['userId', 'at', 'id']));
  assert.equal(index('ledger', ['userId', 'type', 'refId']).options.unique, true);
  assert.ok(index('notifications', ['audience', 'createdAt']));
});

test('production config requires MongoDB instead of silently choosing memory storage', () => {
  const keys = ['NODE_ENV', 'MONGODB_ENABLED', 'MONGODB_URI', 'MONGODB_DB', 'OTP_SECRET', 'EXPOSE_DEV_OTP', 'SMS_PROVIDER', 'JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: 'production',
    OTP_SECRET: 'test-secret-that-is-long-enough-for-production',
    EXPOSE_DEV_OTP: 'false',
    SMS_PROVIDER: 'webhook',
    JWT_PRIVATE_KEY: 'test-private-key',
    JWT_PUBLIC_KEY: 'test-public-key',
  });
  delete process.env.MONGODB_URI;
  try {
    assert.throws(() => loadConfig(), /MONGODB_URI is required in production/);
    process.env.MONGODB_URI = 'mongodb://localhost:27017/yogreen?replicaSet=rs0';
    assert.equal(loadConfig().mongo.uri, process.env.MONGODB_URI);
    process.env.MONGODB_ENABLED = 'false';
    assert.throws(() => loadConfig(), /MONGODB_ENABLED must be true in production/);
    process.env.MONGODB_ENABLED = 'true';
    assert.equal(loadConfig().mongo.enabled, true);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('development uses in-memory storage by default and supports explicit MongoDB opt-in', () => {
  const keys = ['NODE_ENV', 'MONGODB_ENABLED', 'MONGODB_URI'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = 'development';
  process.env.MONGODB_URI = 'mongodb+srv://localhost/yogreen';
  delete process.env.MONGODB_ENABLED;
  try {
    assert.equal(loadConfig().mongo.enabled, false);
    process.env.MONGODB_ENABLED = 'true';
    assert.equal(loadConfig().mongo.enabled, true);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
