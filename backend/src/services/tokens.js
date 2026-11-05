import { signJwt, verifyJwt, sha256, randomToken } from '../lib/crypto.js';
import { unauthorized } from '../lib/http.js';

export class Tokens {
  constructor(cfg, store) { this.cfg = cfg; this.store = store; }

  access(user, sid) {
    const now = Math.floor(Date.now() / 1000);
    return signJwt(
      { iss: this.cfg.jwt.issuer, aud: this.cfg.jwt.audience, sub: user.id, role: user.role, sid, iat: now, exp: now + this.cfg.jwt.accessTtlSec },
      this.cfg.jwt.privateKey,
    );
  }
  verify(token) {
    return verifyJwt(token, this.cfg.jwt.publicKey, { issuer: this.cfg.jwt.issuer, audience: this.cfg.jwt.audience });
  }
  async #mintRefresh(sid) {
    const raw = `${sid}.${randomToken(32)}`;
    await this.store.putRefresh(sha256(raw), { sid, used: false, expiresAt: Date.now() + this.cfg.jwt.refreshTtlSec * 1000 });
    return raw;
  }
  async startSession(user, client, deviceId) {
    const sid = this.store.id();
    await this.store.saveSession({ id: sid, userId: user.id, client, deviceId, revoked: false, createdAt: Date.now() });
    return this.#bundle(user, sid);
  }
  async #bundle(user, sid) {
    return { accessToken: this.access(user, sid), refreshToken: await this.#mintRefresh(sid), expiresIn: this.cfg.jwt.accessTtlSec };
  }
  /** Rotating refresh tokens with reuse detection: replaying an old token kills the whole session. */
  async rotate(rawToken) {
    const { token: rec, reason } = await this.store.consumeRefresh(sha256(String(rawToken)), Date.now());
    if (!rec || reason === 'missing') throw unauthorized('Invalid refresh token');
    const session = await this.store.findSession(rec.sid);
    if (!session || session.revoked) throw unauthorized('Session ended');
    if (reason === 'used') throw unauthorized('Refresh token reuse detected');
    if (reason === 'expired') throw unauthorized('Refresh token expired');
    const user = await this.store.findUser(session.userId);
    if (!user || user.status !== 'active') throw unauthorized('Account unavailable');
    return { user, ...await this.#bundle(user, rec.sid) };
  }
  async revokeSession(sid) {
    const session = await this.store.findSession(sid);
    if (session) { session.revoked = true; await this.store.saveSession(session); }
  }
  async revokeAllForUser(userId) { await this.store.revokeSessions(userId); }
}
