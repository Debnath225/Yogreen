import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, onboard } from './helpers.js';

test('HTTP hardening', async (t) => {
  const s = await boot({ corsOrigins: ['https://web.yogreen.test'] });
  t.after(s.close);

  await t.test('security headers present, no stack traces on errors', async () => {
    const r = await s.call('GET', '/nope');
    assert.equal(r.status, 404);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.ok(r.headers.get('strict-transport-security'));
    assert.equal(r.json.error.code, 'not_found');
  });
  await t.test('405 for wrong method, 400 malformed JSON, 415 wrong content-type, 413 oversize', async () => {
    assert.equal((await s.call('DELETE', '/v1/products')).status, 405);
    const bad = await fetch(s.base + '/v1/auth/otp/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    assert.equal(bad.status, 400);
    const ct = await fetch(s.base + '/v1/auth/otp/send', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    assert.equal(ct.status, 415);
    const big = await fetch(s.base + '/v1/auth/otp/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(70_000) }) });
    assert.equal(big.status, 413);
  });
  await t.test('CORS: allowed origin echoed, unknown origin blocked', async () => {
    const ok = await s.call('GET', '/health', { headers: { origin: 'https://web.yogreen.test' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://web.yogreen.test');
    const no = await s.call('GET', '/health', { headers: { origin: 'https://evil.test' } });
    assert.equal(no.status, 403);
  });
  await t.test('mass assignment: role cannot be set via profile endpoints', async () => {
    const u = await onboard(s, '9832000001');
    const r = await s.call('PATCH', '/v1/me', { token: u.token, body: { name: 'Mallory Doe', role: 'super_admin' } });
    assert.equal(r.json.user.role, 'customer');
    assert.equal((await s.call('GET', '/v1/admin/orders', { token: u.token })).status, 403);
  });
  await t.test('account deletion ends sessions and frees the number', async () => {
    const u = await onboard(s, '9832000002');
    assert.equal((await s.call('DELETE', '/v1/me', { token: u.token })).status, 200);
    assert.equal((await s.call('GET', '/v1/me', { token: u.token })).status, 401);
    const again = await s.login('9832000002');
    assert.equal(again.json.isNewUser, true);
  });
});

test('rate limiting', async (t) => {
  const s = await boot({ limits: { authPerMin: 3, globalPerMin: 100000 } });
  t.after(s.close);
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await s.call('POST', '/v1/auth/otp/send', { body: { phone: `98300000${i}0`, client: 'customer_app' } })).status);
  assert.deepEqual(codes.slice(0, 3), [200, 200, 200]);
  assert.equal(codes[3], 429);
});
