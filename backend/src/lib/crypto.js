import { createHash, createHmac, createSign, createVerify, randomBytes, timingSafeEqual } from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const hmac = (secret, s) => createHmac('sha256', secret).update(s).digest('hex');
export const randomToken = (n = 32) => randomBytes(n).toString('base64url');

export function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
}

/** RS256 JWT sign. */
export function signJwt(payload, privateKey) {
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey);
  return `${head}.${body}.${b64u(sig)}`;
}

/** Returns payload or null. Pins alg to RS256 (blocks alg=none / HS256 confusion). */
export function verifyJwt(token, publicKey, { issuer, audience } = {}) {
  try {
    const [h, p, s] = String(token).split('.');
    if (!h || !p || !s) return null;
    const head = JSON.parse(fromB64u(h).toString());
    if (head.alg !== 'RS256') return null;
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, fromB64u(s));
    if (!ok) return null;
    const payload = JSON.parse(fromB64u(p).toString());
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (issuer && payload.iss !== issuer) return null;
    if (audience && payload.aud !== audience) return null;
    return payload;
  } catch {
    return null;
  }
}
