import { V } from '../lib/http.js';

const ok = (body) => ({ status: 200, body });
const auth = { auth: true };

export function registerWalletRoutes(app) {
  const { router, cfg, wallet, notifier } = app;
  router.add('GET', '/v1/wallet', auth, async ({ user }) => ok({
    ...await wallet.summary(user),
    rules: { earnRatePct: cfg.ygc.earnRate * 100, maxRedeemPct: cfg.ygc.maxRedeemPct * 100, coinValueInr: cfg.ygc.valueInr },
  }));
  router.add('GET', '/v1/wallet/history', auth, async ({ user, query }) => {
    const limit = Math.min(50, Math.max(1, parseInt(query.get('limit') || '20', 10) || 20));
    const before = parseInt(query.get('before') || '0', 10) || undefined;
    return ok(await wallet.history(user.id, { limit, before }));
  });
  router.add('POST', '/v1/wallet/checkin', auth, async ({ user }) => ok(await wallet.checkin(user)));
  router.add('GET', '/v1/notifications', auth, async ({ user }) => ok(await notifier.forUser(user)));
  router.add('POST', '/v1/notifications/read', auth, async ({ user }) => {
    await notifier.markAllRead(user);
    return ok({ ok: true });
  });
}
