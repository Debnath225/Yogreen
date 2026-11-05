import { V, forbidden, HttpError, normalizePhone } from '../lib/http.js';
import { publicUser } from '../lib/public-user.js';

export const CLIENTS = {
  customer_app: { roles: ['customer'], signup: true },
  web: { roles: ['customer', 'rider', 'admin', 'super_admin'], signup: true },
  rider_app: { roles: ['rider'], signup: true },
  admin_app: { roles: ['admin', 'super_admin'], signup: false },
};

const ok = (body, status = 200) => ({ status, body });
const PHONE_VERIFICATION_BODY_LIMIT = 7 * 1024 * 1024;
const MAX_LICENSE_BYTES = 5 * 1024 * 1024;
const LICENSE_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export const authControllerOptions = { verifyBodyBytes: PHONE_VERIFICATION_BODY_LIMIT };

function parseRiderApplication(body) {
  const application = V.obj(body, 'application');
  const name = V.str(application, 'name', { min: 2, max: 60, re: /^[\p{L}][\p{L}\p{M} .'-]*$/u });
  const vehicle = V.obj(application, 'vehicle');
  const type = V.oneOf(vehicle, 'type', ['motorcycle', 'scooter', 'bicycle', 'other']);
  const makeModel = V.str(vehicle, 'makeModel', { min: 2, max: 80, re: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'&()/-]*$/u });
  const registration = V.str(vehicle, 'registration', { min: 4, max: 20, re: /^[A-Za-z0-9 -]+$/ });
  const license = V.obj(application, 'license');
  const number = V.str(license, 'number', { min: 4, max: 30, re: /^[A-Za-z0-9/-]+$/ });
  const document = V.obj(license, 'document');
  const fileName = V.str(document, 'name', { max: 120, re: /^[^<>:"/\\|?*\u0000-\u001f]+$/ });
  const mimeType = V.oneOf(document, 'mimeType', [...LICENSE_MIME_TYPES]);
  const base64 = V.str(document, 'base64', { min: 4, max: Math.ceil(MAX_LICENSE_BYTES / 3) * 4 + 8 });
  const extension = fileName.split('.').pop()?.toLowerCase();
  const expectedExtension = mimeType === 'application/pdf' ? ['pdf'] : mimeType === 'image/png' ? ['png'] : ['jpg', 'jpeg'];
  if (!expectedExtension.includes(extension || '')) throw new HttpError(422, 'validation_error', 'license.document.name: file extension does not match its type');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new HttpError(422, 'validation_error', 'license.document.base64: invalid base64 data');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_LICENSE_BYTES || bytes.toString('base64') !== base64) {
    throw new HttpError(422, 'validation_error', 'license.document: file must be no larger than 5 MB');
  }
  const validSignature = mimeType === 'application/pdf'
    ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
    : mimeType === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!validSignature) throw new HttpError(422, 'validation_error', 'license.document: file content does not match its type');
  return {
    name,
    vehicle: { type, makeModel, registration: registration.toUpperCase().replace(/\s+/g, '') },
    license: { number: number.toUpperCase(), document: { name: fileName, mimeType, content: bytes } },
  };
}

export function createAuthController({ store, cfg, otp, tokens }) {
  const authRate = { key: 'auth', limit: cfg.limits.authPerMin, windowMs: 60_000 };
  const genericOtpResponse = () => ({
    resendIn: Math.ceil(cfg.otp.resendCooldownMs / 1000),
    expiresIn: Math.ceil(cfg.otp.ttlMs / 1000),
  });

  return {
    authRate,
    async sendOtp({ body }) {
      const phone = normalizePhone(body.phone);
      const client = V.oneOf(body, 'client', Object.keys(CLIENTS));
      const mode = V.oneOf(body, 'mode', ['login', 'signup'], { optional: true });
      const user = await store.findUserByPhone(phone);
      if (mode === 'signup' && user) throw new HttpError(409, 'account_exists', 'An account already uses this phone number');
      if (client === 'admin_app') {
        if (!user || user.status !== 'active' || !CLIENTS[client].roles.includes(user.role)) return ok(genericOtpResponse());
      } else if (client === 'rider_app' && mode !== 'signup' && (!user || user.status === 'rejected' || user.role !== 'rider')) {
        return ok(genericOtpResponse());
      }
      return ok(await otp.send(phone));
    },
    async verifyOtp({ body }) {
      const phone = normalizePhone(body.phone);
      const client = V.oneOf(body, 'client', Object.keys(CLIENTS));
      const mode = V.oneOf(body, 'mode', ['login', 'signup'], { optional: true });
      const code = V.str(body, 'otp', { min: 6, max: 6, re: /^\d{6}$/ });
      const deviceId = V.str(body, 'deviceId', { max: 100, optional: true });
      if (body.application !== undefined && client !== 'rider_app') {
        throw new HttpError(422, 'validation_error', 'application: only rider sign-up accepts application data');
      }
      const application = client === 'rider_app' && mode === 'signup' ? parseRiderApplication(body) : undefined;
      const policy = CLIENTS[client];
      await otp.verify(phone, code);
      let user = await store.findUserByPhone(phone);
      const isSignup = mode === 'signup' || (!mode && client === 'rider_app' && !user);
      if (mode === 'login' && !user) throw new HttpError(401, 'account_not_found', 'No account is registered with this phone number');
      if (isSignup && user) throw new HttpError(409, 'account_exists', 'An account already uses this phone number');

      let isNewUser = false;
      if (!user) {
        if (!policy.signup) throw new HttpError(401, 'invalid_otp', 'Invalid or expired OTP');
        if (client === 'rider_app') {
          if (!application) throw new HttpError(422, 'validation_error', 'application: rider signup details are required');
          try {
            user = await store.insertRiderApplication({
              id: store.id(),
              phone,
              name: application.name,
              role: 'rider',
              status: 'pending_approval',
              setupCompleted: true,
              createdAt: Date.now(),
              appliedAt: Date.now(),
              application,
              online: false,
              notifReadAt: 0,
              addresses: [],
              prefs: { language: 'en', pushEnabled: true },
            });
          } catch (error) {
            if (error.code !== 11000) throw error;
            throw new HttpError(409, 'account_exists', 'An account already uses this phone number');
          }
          return ok({ pendingApproval: true, message: 'Your rider application was submitted for admin review.' }, 202);
        }
        try {
          user = await store.insertUser({
            id: store.id(), phone, role: 'customer', status: 'active', setupCompleted: false, createdAt: Date.now(),
            notifReadAt: 0, addresses: [], prefs: { language: 'en', pushEnabled: true },
          });
          isNewUser = true;
        } catch (error) {
          if (error.code !== 11000) throw error;
          user = await store.findUserByPhone(phone);
          if (!user) throw error;
        }
      }
      if (user.status === 'pending_approval') throw new HttpError(403, 'rider_pending_approval', 'Your rider application is waiting for admin approval');
      if (user.status === 'rejected') throw new HttpError(403, 'rider_application_rejected', 'Your rider application was not approved. Contact rider support.');
      if (user.status !== 'active') throw forbidden('This account is not active');
      if (!policy.roles.includes(user.role)) throw new HttpError(403, 'wrong_app', 'This number is registered for a different app');
      return ok({ user: publicUser(user), isNewUser, needsSetup: !user.setupCompleted, ...await tokens.startSession(user, client, deviceId) });
    },
    async refresh({ body }) {
      const { user, ...tokenPair } = await tokens.rotate(V.str(body, 'refreshToken', { max: 200 }));
      return ok({ user: publicUser(user), ...tokenPair });
    },
    async logout({ session }) {
      await tokens.revokeSession(session.id);
      return ok({ ok: true });
    },
  };
}
