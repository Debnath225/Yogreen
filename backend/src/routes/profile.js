import { V, HttpError, notFound } from '../lib/http.js';
import { parseAddress, publicUser } from './shared.js';

const ok = (body, status = 200) => ({ status, body });

export function registerProfileRoutes(app) {
  const { router, store, cfg, wallet, notifier, tokens } = app;
  const auth = { auth: true };

  router.add('GET', '/v1/me', auth, async ({ user }) => ok({ user: publicUser(user), addresses: user.addresses, wallet: await wallet.summary(user) }));
  router.add('PATCH', '/v1/me', auth, async ({ user, body }) => {
    const name = V.str(body, 'name', { min: 2, max: 60, optional: true });
    const email = V.str(body, 'email', { max: 120, re: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, optional: true });
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (email !== undefined) patch.email = email.toLowerCase();
    if (body.prefs !== undefined) {
      const prefs = V.obj(body, 'prefs');
      patch.prefs = {
        language: V.oneOf(prefs, 'language', ['en', 'hi', 'bn'], { optional: true }) ?? user.prefs.language,
        pushEnabled: V.bool(prefs, 'pushEnabled', { optional: true }) ?? user.prefs.pushEnabled,
      };
    }
    Object.assign(user, patch);
    await store.patchUser(user.id, patch);
    return ok({ user: publicUser(user) });
  });
  router.add('PUT', '/v1/me/setup', auth, async ({ user, body }) => {
    const name = V.str(body, 'name', { min: 2, max: 60 });
    const email = V.str(body, 'email', { max: 120, re: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, optional: true });
    const address = parseAddress(V.obj(body, 'address'));
    const prefs = V.obj(body, 'prefs', { optional: true }) || {};
    const patch = {
      name,
      prefs: {
        language: V.oneOf(prefs, 'language', ['en', 'hi', 'bn'], { optional: true }) ?? 'en',
        pushEnabled: V.bool(prefs, 'pushEnabled', { optional: true }) ?? true,
      },
      setupCompleted: true,
    };
    if (email) patch.email = email.toLowerCase();
    if (!user.addresses.length) patch.addresses = [...user.addresses, { id: store.id(), ...address }];
    Object.assign(user, patch);
    await store.patchUser(user.id, patch);
    const bonus = await wallet.post(user.id, 'bonus', cfg.ygc.signupBonus, 'Welcome bonus', 'signup');
    if (bonus) {
      await notifier.create({
        audience: user.id,
        title: `Welcome to YoGreen, ${name.split(' ')[0]}! 🌿`,
        body: `${cfg.ygc.signupBonus} YGC coins have been added to your wallet.`,
        data: { type: 'wallet' },
      });
    }
    return ok({
      user: publicUser(user),
      addresses: user.addresses,
      wallet: await wallet.summary(user),
      bonusGranted: bonus ? cfg.ygc.signupBonus : 0,
    });
  });
  router.add('GET', '/v1/me/addresses', auth, ({ user }) => ok({ items: user.addresses }));
  router.add('POST', '/v1/me/addresses', auth, async ({ user, body }) => {
    if (user.addresses.length >= 8) throw new HttpError(409, 'limit', 'You can save up to 8 addresses');
    const address = { id: store.id(), ...parseAddress(body) };
    user.addresses.push(address);
    await store.patchUser(user.id, { addresses: user.addresses });
    return ok(address, 201);
  });
  router.add('DELETE', '/v1/me/addresses/:id', auth, async ({ user, params }) => {
    const index = user.addresses.findIndex((address) => address.id === params.id);
    if (index < 0) throw notFound();
    user.addresses.splice(index, 1);
    await store.patchUser(user.id, { addresses: user.addresses });
    return ok({ ok: true });
  });
  router.add('POST', '/v1/me/devices', auth, async ({ user, body }) => {
    const token = V.str(body, 'token', { max: 300 });
    const platform = V.oneOf(body, 'platform', ['ios', 'android', 'web']);
    await store.upsertDevice(user.id, token, platform, Date.now());
    return ok({ ok: true });
  });
  router.add('DELETE', '/v1/me', auth, async ({ user, session }) => {
    Object.assign(user, { phone: `deleted:${user.id}`, status: 'deleted', name: '', email: '', addresses: [] });
    await store.patchUser(user.id, { phone: user.phone, status: user.status, name: user.name, email: user.email, addresses: user.addresses });
    await store.deleteUserDevices(user.id);
    await store.deleteCart(user.id);
    await tokens.revokeAllForUser(user.id);
    await store.appendAudit(user.id, 'account.delete', {});
    return ok({ ok: true, session: session.id });
  });
}
