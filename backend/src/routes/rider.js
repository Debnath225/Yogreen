import { V } from '../lib/http.js';
import { publicUser } from './shared.js';

const ok = (body) => ({ status: 200, body });
const riderOnly = { auth: true, roles: ['rider'] };

export function registerRiderRoutes(app) {
  const { router, store, riders } = app;
  router.add('GET', '/v1/rider/me', riderOnly, async ({ user }) => ok({
    rider: { ...publicUser(user), role: 'rider' },
    ...await riders.summary(user),
  }));
  router.add('POST', '/v1/rider/status', riderOnly, async ({ user, body }) => ok(await riders.setOnline(user, V.bool(body, 'online'))));
  router.add('GET', '/v1/rider/orders', riderOnly, async ({ user, query }) => {
    const scope = V.oneOf({ scope: query.get('scope') ?? 'available' }, 'scope', ['available', 'active', 'done']);
    return ok(await riders.list(user, scope));
  });
  router.add('GET', '/v1/rider/orders/:id', riderOnly, async ({ user, params }) => ok({
    order: await riders.get(user, V.str(params, 'id', { max: 64 })),
  }));
  router.add('POST', '/v1/rider/orders/:id/claim', riderOnly, async ({ user, params }) => ok({
    order: await riders.claim(user, V.str(params, 'id', { max: 64 })),
  }));
  router.add('POST', '/v1/rider/orders/:id/release', riderOnly, async ({ user, params }) => ok({
    order: await riders.release(user, V.str(params, 'id', { max: 64 })),
  }));
  router.add('POST', '/v1/rider/orders/:id/pickup', riderOnly, async ({ user, params }) => ok({
    order: await riders.pickup(user, V.str(params, 'id', { max: 64 })),
  }));
  router.add('POST', '/v1/rider/orders/:id/deliver', riderOnly, async ({ user, params, body }) => {
    const code = V.str(body, 'code', { re: /^\d{4}$/ });
    return ok(await riders.deliver(user, V.str(params, 'id', { max: 64 }), code));
  });
  router.add('GET', '/v1/rider/earnings', riderOnly, async ({ user }) => ok(await riders.earnings(user)));
  router.add('PATCH', '/v1/rider/profile', riderOnly, async ({ user, body }) => {
    const name = V.str(body, 'name', { min: 2, max: 60, re: /^[\p{L}][\p{L}\p{M} .'-]*$/u });
    const updated = await store.patchUser(user.id, { name });
    return ok({ rider: { ...publicUser(updated), role: 'rider' } });
  });
}
