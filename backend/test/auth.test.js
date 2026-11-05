import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

test('OTP signup/login flow, validation and abuse protection', async (t) => {
  const s = await boot({ otp: { resendCooldownMs: 0, maxAttempts: 3, maxSendsPerHour: 1000 } });
  t.after(s.close);

  await t.test('rejects invalid phone numbers and non-string input (NoSQL-style payloads)', async () => {
    for (const phone of ['12345', '+1555123456', { $ne: null }, '', null]) {
      const r = await s.call('POST', '/v1/auth/otp/send', { body: { phone, client: 'customer_app' } });
      assert.equal(r.status, 422, JSON.stringify(phone));
    }
  });
  await t.test('new customer: send -> verify -> tokens, isNewUser, needsSetup', async () => {
    const v = await s.login('9830012345');
    assert.equal(v.status, 200);
    assert.equal(v.json.isNewUser, true);
    assert.equal(v.json.needsSetup, true);
    assert.equal(v.json.user.phone, '+919830012345');
    assert.equal(v.json.user.role, 'customer');
    const again = await s.login('+919830012345');
    assert.equal(again.json.isNewUser, false);
  });
  await t.test('explicit login never creates an account; signup rejects an existing account', async () => {
    const phone = '9830077777';
    const loginOtp = await s.call('POST', '/v1/auth/otp/send', { body: { phone, client: 'customer_app', mode: 'login' } });
    assert.match(loginOtp.json.devOtp, /^\d{6}$/);
    const missing = await s.call('POST', '/v1/auth/otp/verify', { body: { phone, client: 'customer_app', mode: 'login', otp: loginOtp.json.devOtp } });
    assert.equal(missing.status, 401);
    assert.equal(missing.json.error.code, 'account_not_found');
    assert.equal(await s.app.store.findUserByPhone('+919830077777'), undefined);

    const signupOtp = await s.call('POST', '/v1/auth/otp/send', { body: { phone, client: 'customer_app', mode: 'signup' } });
    const signup = await s.call('POST', '/v1/auth/otp/verify', { body: { phone, client: 'customer_app', mode: 'signup', otp: signupOtp.json.devOtp } });
    assert.equal(signup.status, 200);
    const duplicateSignup = await s.call('POST', '/v1/auth/otp/send', { body: { phone, client: 'customer_app', mode: 'signup' } });
    assert.equal(duplicateSignup.status, 409);

    const existingLoginOtp = await s.call('POST', '/v1/auth/otp/send', { body: { phone, client: 'customer_app', mode: 'login' } });
    const existingLogin = await s.call('POST', '/v1/auth/otp/verify', { body: { phone, client: 'customer_app', mode: 'login', otp: existingLoginOtp.json.devOtp } });
    assert.equal(existingLogin.status, 200);
    assert.equal(existingLogin.json.isNewUser, false);
  });
  await t.test('wrong OTP rejected; OTP is single use; attempt limit invalidates', async () => {
    const send = await s.call('POST', '/v1/auth/otp/send', { body: { phone: '9830099999', client: 'customer_app' } });
    const wrong = send.json.devOtp === '000000' ? '111111' : '000000';
    const bad = await s.call('POST', '/v1/auth/otp/verify', { body: { phone: '9830099999', client: 'customer_app', otp: wrong } });
    assert.equal(bad.status, 401);
    const good = await s.call('POST', '/v1/auth/otp/verify', { body: { phone: '9830099999', client: 'customer_app', otp: send.json.devOtp } });
    assert.equal(good.status, 200);
    const reuse = await s.call('POST', '/v1/auth/otp/verify', { body: { phone: '9830099999', client: 'customer_app', otp: send.json.devOtp } });
    assert.equal(reuse.status, 401);
    const s2 = await s.call('POST', '/v1/auth/otp/send', { body: { phone: '9830088888', client: 'customer_app' } });
    const w2 = s2.json.devOtp === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) await s.call('POST', '/v1/auth/otp/verify', { body: { phone: '9830088888', client: 'customer_app', otp: w2 } });
    const locked = await s.call('POST', '/v1/auth/otp/verify', { body: { phone: '9830088888', client: 'customer_app', otp: s2.json.devOtp } });
    assert.equal(locked.status, 429);
  });
  await t.test('resend cooldown and hourly cap', async () => {
    const strict = await boot({ otp: { resendCooldownMs: 30_000, maxSendsPerHour: 5 } });
    const a = await strict.call('POST', '/v1/auth/otp/send', { body: { phone: '9830011111', client: 'customer_app' } });
    assert.equal(a.status, 200);
    const b = await strict.call('POST', '/v1/auth/otp/send', { body: { phone: '9830011111', client: 'customer_app' } });
    assert.equal(b.status, 429);
    assert.ok(b.headers.get('retry-after'));
    await strict.close();
  });
  await t.test('staff apps never reveal registration and never auto-signup', async () => {
    const r = await s.call('POST', '/v1/auth/otp/send', { body: { phone: '9811111111', client: 'rider_app' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.devOtp, undefined);
    assert.equal(s.app.sms.outbox.some((m) => m.phone === '+919811111111'), false);
    const v = await s.call('POST', '/v1/auth/otp/verify', { body: { phone: '9811111111', client: 'rider_app', otp: '123456' } });
    assert.equal(v.status, 401);
  });
  await t.test('super admin can log in on admin_app but not on customer_app (wrong_app)', async () => {
    const ok = await s.login('9000000000', 'admin_app');
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.role, 'super_admin');
    const wrong = await s.login('9000000000', 'customer_app');
    assert.equal(wrong.status, 403);
    assert.equal(wrong.json.error.code, 'wrong_app');
  });
  await t.test('production config refuses insecure settings', async () => {
    const { loadConfig } = await import('../src/config.js');
    assert.throws(() => loadConfig({ nodeEnv: 'production' }));
  });
});

test('tokens: rotation, reuse detection, logout, tampering', async (t) => {
  const s = await boot();
  t.after(s.close);
  const v = await s.login('9831000001');
  const { accessToken, refreshToken } = v.json;

  await t.test('access token works; garbage / alg=none / tampered rejected', async () => {
    assert.equal((await s.call('GET', '/v1/me', { token: accessToken })).status, 200);
    assert.equal((await s.call('GET', '/v1/me')).status, 401);
    assert.equal((await s.call('GET', '/v1/me', { token: 'abc.def.ghi' })).status, 401);
    const [h, p] = accessToken.split('.');
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${p}.`;
    assert.equal((await s.call('GET', '/v1/me', { token: none })).status, 401);
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), role: 'super_admin' })).toString('base64url')}.${accessToken.split('.')[2]}`;
    assert.equal((await s.call('GET', '/v1/admin/orders', { token: forged })).status, 401);
  });
  await t.test('refresh rotates; replaying old refresh token revokes the whole session', async () => {
    const r1 = await s.call('POST', '/v1/auth/refresh', { body: { refreshToken } });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.json.refreshToken, refreshToken);
    const replay = await s.call('POST', '/v1/auth/refresh', { body: { refreshToken } });
    assert.equal(replay.status, 401);
    const r2 = await s.call('POST', '/v1/auth/refresh', { body: { refreshToken: r1.json.refreshToken } });
    assert.equal(r2.status, 401, 'family revoked after reuse');
    assert.equal((await s.call('GET', '/v1/me', { token: accessToken })).status, 401, 'access token of revoked session is dead');
  });
  await t.test('logout revokes immediately', async () => {
    const v2 = await s.login('9831000002');
    assert.equal((await s.call('POST', '/v1/auth/logout', { token: v2.json.accessToken })).status, 200);
    assert.equal((await s.call('GET', '/v1/me', { token: v2.json.accessToken })).status, 401);
  });
});
