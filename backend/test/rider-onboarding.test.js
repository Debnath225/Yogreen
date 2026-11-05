import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const application = {
  name: 'Rider Applicant',
  vehicle: { type: 'motorcycle', makeModel: 'Honda Activa', registration: 'WB01AB1234' },
  license: {
    number: 'WB0120200012345',
    document: { name: 'license.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4\nLicense scan').toString('base64') },
  },
};

test('rider signup requires phone verification and admin approval', async (t) => {
  const s = await boot();
  t.after(s.close);
  const phone = '9876500001';
  const send = async (mode) => s.call('POST', '/v1/auth/otp/send', { body: { phone, client: 'rider_app', mode } });
  const verify = async (code, data = application) => s.call('POST', '/v1/auth/otp/verify', {
    body: { phone, client: 'rider_app', mode: 'signup', otp: code, ...(data ? { application: data } : {}) },
  });

  await t.test('rejects malformed application data before creating a rider', async () => {
    const sent = await send('signup');
    assert.equal(sent.status, 200);
    const invalid = await verify(sent.json.devOtp, { ...application, license: { ...application.license, document: { ...application.license.document, mimeType: 'text/plain' } } });
    assert.equal(invalid.status, 422);
    assert.equal(await s.app.store.findUserByPhone('+919876500001'), undefined);
  });

  const sent = await send('signup');
  const created = await verify(sent.json.devOtp);
  assert.equal(created.status, 202);
  assert.equal(created.json.pendingApproval, true);
  assert.equal(created.json.accessToken, undefined);
  assert.equal((await s.app.store.findUserByPhone('+919876500001')).status, 'pending_approval');

  await t.test('pending rider has no access; admin reviews application and document', async () => {
    const pendingOtp = await send('login');
    const pending = await s.call('POST', '/v1/auth/otp/verify', { body: { phone, client: 'rider_app', mode: 'login', otp: pendingOtp.json.devOtp } });
    assert.equal(pending.status, 403);
    assert.equal(pending.json.error.code, 'rider_pending_approval');

    const admin = await s.login('9000000000', 'admin_app');
    const unauthorized = await s.call('GET', '/v1/admin/riders/applications');
    assert.equal(unauthorized.status, 401);
    const applications = await s.call('GET', '/v1/admin/riders/applications', { token: admin.json.accessToken });
    assert.equal(applications.status, 200);
    const rider = applications.json.items.find((item) => item.phone === '+919876500001');
    assert.equal(rider.name, application.name);
    assert.equal(rider.vehicle.registration, 'WB01AB1234');
    assert.equal(rider.license.number, application.license.number);
    assert.equal(JSON.stringify(rider).includes(application.license.document.base64), false);

    const missingNote = await s.call('PATCH', `/v1/admin/riders/${rider.id}/review`, { token: admin.json.accessToken, body: { decision: 'reject' } });
    assert.equal(missingNote.status, 422);
    const invalidDecision = await s.call('PATCH', `/v1/admin/riders/${rider.id}/review`, { token: admin.json.accessToken, body: { decision: 'activate' } });
    assert.equal(invalidDecision.status, 422);

    const license = await s.call('GET', `/v1/admin/riders/${rider.id}/license`, { token: admin.json.accessToken });
    assert.equal(license.status, 200);
    assert.equal(Buffer.from(license.json.base64, 'base64').toString(), Buffer.from(application.license.document.base64, 'base64').toString());

    const approved = await s.call('PATCH', `/v1/admin/riders/${rider.id}/review`, { token: admin.json.accessToken, body: { decision: 'approve' } });
    assert.equal(approved.status, 200);
    assert.equal(approved.json.rider.status, 'active');
    const duplicateReview = await s.call('PATCH', `/v1/admin/riders/${rider.id}/review`, { token: admin.json.accessToken, body: { decision: 'approve' } });
    assert.equal(duplicateReview.status, 409);

    const loginOtp = await send('login');
    const login = await s.call('POST', '/v1/auth/otp/verify', { body: { phone, client: 'rider_app', mode: 'login', otp: loginOtp.json.devOtp } });
    assert.equal(login.status, 200);
    assert.equal(login.json.user.role, 'rider');
    assert.ok(login.json.accessToken);
    assert.equal((await s.call('GET', '/v1/rider/me', { token: login.json.accessToken })).status, 200);
  });
});
