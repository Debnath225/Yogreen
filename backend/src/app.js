import http from 'node:http';
import { loadConfig } from './config.js';
import { Store, seedPersistentProducts } from './store.js';
import { MongoStore } from './db/mongo.js';
import { Router, HttpError, readJson, unauthorized, forbidden } from './lib/http.js';
import { RateLimiter } from './lib/ratelimit.js';
import { Bus } from './lib/bus.js';
import { attachWs } from './lib/ws.js';
import { Tokens } from './services/tokens.js';
import { OtpService, SmsGateway } from './services/otp.js';
import { Wallet } from './services/wallet.js';
import { Notifier } from './services/notifier.js';
import { Catalog } from './services/catalog.js';
import { Orders } from './services/orders.js';
import { Riders } from './services/riders.js';
import { registerRoutes } from './routes/index.js';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-site',
  'cache-control': 'no-store',
};

export function createApp(overrides = {}) {
  const cfg = loadConfig(overrides);
  const store = cfg.mongo.enabled && cfg.mongo.uri && !cfg.isTest ? new MongoStore(cfg.mongo) : new Store();
  const bus = new Bus();
  const limiter = new RateLimiter();
  const sms = new SmsGateway(cfg);
  const app = { cfg, store, bus, sms, router: new Router(), limiter };
  app.tokens = new Tokens(cfg, store);
  app.otp = new OtpService(cfg, store, sms);
  app.wallet = new Wallet(cfg, store);
  app.notifier = new Notifier(cfg, store, bus);
  app.catalog = new Catalog(store, bus);
  app.orders = new Orders(cfg, store, app.catalog, app.wallet, app.notifier, bus);
  app.riders = new Riders(store, bus, app.notifier, app.orders);
  registerRoutes(app);

  app.ready = (async () => {
    if (store.connect) await store.connect();
    await seedPersistentProducts(store);
    if (cfg.superAdminPhone) {
      await store.createUserIfAbsent({ id: store.id(), phone: cfg.superAdminPhone, role: 'super_admin', name: 'Super Admin', status: 'active', setupCompleted: true, createdAt: Date.now(), notifReadAt: 0, addresses: [], prefs: { language: 'en', pushEnabled: true } });
    }
  })();

  const originAllowed = (origin) => !origin || cfg.corsOrigins.includes(origin);
  const clientIp = (req) => (cfg.trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';

  function send(res, status, body, headers = {}, raw) {
    const payload = raw ?? (body === undefined ? '' : JSON.stringify(body));
    res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', ...headers });
    res.end(status === 204 || status === 304 ? undefined : payload);
  }

  async function authenticate(req) {
    const h = req.headers.authorization || '';
    const m = /^Bearer (.+)$/.exec(h);
    if (!m) throw unauthorized();
    const claims = app.tokens.verify(m[1]);
    if (!claims) throw unauthorized('Invalid or expired token');
    const session = await store.findSession(claims.sid);
    if (!session || session.revoked) throw unauthorized('Session ended');
    const user = await store.findUser(claims.sub);
    if (!user || user.status !== 'active') throw unauthorized('Account unavailable');
    return { user, session };
  }

  const server = http.createServer(async (req, res) => {
    const ip = clientIp(req);
    const origin = req.headers.origin;
    const cors = {};
    if (origin && originAllowed(origin)) {
      Object.assign(cors, { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-headers': 'authorization,content-type,idempotency-key', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-max-age': '600' });
    }
    try {
      await app.ready;
      if (origin && !originAllowed(origin)) throw forbidden('Origin not allowed');
      if (req.method === 'OPTIONS') return send(res, 204, undefined, cors);
      const url = new URL(req.url, 'http://localhost');
      const g = limiter.hit(`g:${ip}`, cfg.limits.globalPerMin, 60_000);
      if (!g.ok) throw new HttpError(429, 'rate_limited', 'Too many requests', { retryAfter: g.retryAfter });

      const { route, params, pathMatched } = app.router.match(req.method, url.pathname);
      if (!route) throw pathMatched ? new HttpError(405, 'method_not_allowed', 'Method not allowed') : new HttpError(404, 'not_found', 'Route not found');
      const { opts } = route;
      if (opts.rate) {
        const l = limiter.hit(`${opts.rate.key}:${ip}`, opts.rate.limit, opts.rate.windowMs);
        if (!l.ok) throw new HttpError(429, 'rate_limited', 'Too many requests, slow down', { retryAfter: l.retryAfter });
      }
      let user, session;
      if (opts.auth) {
        ({ user, session } = await authenticate(req));
        if (opts.roles && !opts.roles.includes(user.role)) throw forbidden('Your role cannot perform this action');
      }
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req, opts.bodyBytes ?? cfg.limits.bodyBytes) : {};
      const out = await route.handler({ req, ip, params, query: url.searchParams, body, user, session, headers: req.headers });
      send(res, out.status ?? 200, out.body, { ...cors, ...out.headers }, out.raw);
    } catch (e) {
      if (e instanceof HttpError) {
        const headers = { ...cors };
        if (e.extra?.retryAfter) headers['retry-after'] = String(e.extra.retryAfter);
        return send(res, e.status, { error: { code: e.code, message: e.message, ...(e.extra ? { details: e.extra } : {}) } }, headers);
      }
      console.error('[error]', e);
      send(res, 500, { error: { code: 'internal_error', message: 'Something went wrong' } }, cors);
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 65_000;

  // ------------------------------------------------------------ realtime WS
  const trackingSubscribers = new Map();
  const latestLocations = new Map();
  const publishTracking = (orderId, location) => {
    for (const conn of trackingSubscribers.get(orderId) || []) conn.send({ type: 'tracking_location', orderId, location });
  };
  const offOrderStatus = bus.subscribe('order:status', ({ orderId, userId, status }) => {
    if (status !== 'out_for_delivery') {
      latestLocations.delete(orderId);
      publishTracking(orderId, null);
    }
    for (const conn of trackingSubscribers.get(orderId) || []) conn.send({ type: 'tracking_status', orderId, status, userId });
  });
  const wsHub = attachWs(server, {
    path: '/v1/ws',
    originOk: originAllowed,
    onConnection(conn) {
      let user = null;
      let msgs = 0;
      const subscribedOrders = new Set();
      const publishedOrders = new Set();
      const rl = setInterval(() => { msgs = 0; }, 10_000);
      const offPrices = bus.subscribe('prices', (items) => conn.send({ type: 'prices', items }));
      const offNotif = bus.subscribe('notification', (n) => { if (user && (n.audience === 'all' || n.audience === user.id)) conn.send({ type: 'notification', notification: n }); });
      const offRider = bus.subscribe('rider:event', (event) => {
        if (user?.role !== 'rider') return;
        if (event.type === 'order_assigned' && event.riderId !== user.id) return;
        store.findUser(user.id).then((current) => { if (current?.online) conn.send(event); }).catch((error) => console.error('[ws:rider-event]', error));
      });
      const unsubscribe = (orderId) => {
        subscribedOrders.delete(orderId);
        const subscribers = trackingSubscribers.get(orderId);
        subscribers?.delete(conn);
        if (subscribers?.size === 0) trackingSubscribers.delete(orderId);
      };
      conn.on('close', () => {
        clearInterval(rl); offPrices(); offNotif(); offRider();
        for (const orderId of subscribedOrders) unsubscribe(orderId);
        for (const orderId of publishedOrders) {
          if (latestLocations.get(orderId)?.riderId === user?.id) {
            latestLocations.delete(orderId);
            publishTracking(orderId, null);
          }
        }
      });
      conn.on('message', (text) => {
        handleMessage(text).catch((error) => {
          console.error('[ws:message]', error);
          conn.close(1011);
        });
      });
      const handleMessage = async (text) => {
        if (++msgs > 30) return conn.close(1008);
        let m;
        try { m = JSON.parse(text); } catch { return; }
        if (m.type === 'ping') return conn.send({ type: 'pong' });
        if (m.type === 'auth') {
          const claims = app.tokens.verify(m.token);
          const s = claims && await store.findSession(claims.sid);
          const u = claims && await store.findUser(claims.sub);
          if (!s || s.revoked || !u || u.status !== 'active') return conn.send({ type: 'auth_error' });
          if (user && user.id !== u.id) {
            for (const orderId of subscribedOrders) unsubscribe(orderId);
            for (const orderId of publishedOrders) {
              if (latestLocations.get(orderId)?.riderId === user.id) {
                latestLocations.delete(orderId);
                publishTracking(orderId, null);
              }
            }
            publishedOrders.clear();
          }
          user = u;
          conn.send({ type: 'ready', authed: true });
          return;
        }
        if (m.type === 'tracking_subscribe') {
          if (user?.role !== 'customer' || typeof m.orderId !== 'string') return conn.send({ type: 'tracking_error', orderId: m.orderId, message: 'Tracking is only available to the order owner' });
          const order = await store.getOrder(m.orderId);
          if (!order || order.userId !== user.id) return conn.send({ type: 'tracking_error', orderId: m.orderId, message: 'Order not found' });
          subscribedOrders.add(order.id);
          if (!trackingSubscribers.has(order.id)) trackingSubscribers.set(order.id, new Set());
          trackingSubscribers.get(order.id).add(conn);
          conn.send({ type: 'tracking_status', orderId: order.id, status: order.status });
          if (order.status === 'out_for_delivery') {
            const location = latestLocations.get(order.id);
            if (location) conn.send({ type: 'tracking_location', orderId: order.id, location: { latitude: location.latitude, longitude: location.longitude, updatedAt: location.updatedAt } });
          }
          return;
        }
        if (m.type === 'tracking_unsubscribe') {
          if (typeof m.orderId === 'string') unsubscribe(m.orderId);
          return;
        }
        if (m.type === 'rider_location') {
          if (user?.role !== 'rider' || typeof m.orderId !== 'string') return conn.send({ type: 'tracking_error', orderId: m.orderId, message: 'Rider authentication required' });
          const order = await store.getOrder(m.orderId);
          if (!order || order.riderId !== user.id) return conn.send({ type: 'tracking_error', orderId: m.orderId, message: 'This order is not assigned to you' });
          if (m.location === null) {
            if (latestLocations.get(order.id)?.riderId === user.id) {
              latestLocations.delete(order.id);
              publishTracking(order.id, null);
            }
            publishedOrders.delete(order.id);
            return;
          }
          if (order.status !== 'out_for_delivery') return conn.send({ type: 'tracking_error', orderId: order.id, message: 'Location sharing is only enabled during an active delivery' });
          const { latitude, longitude } = m.location || {};
          if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return conn.send({ type: 'tracking_error', orderId: order.id, message: 'Invalid coordinates' });
          }
          const location = { riderId: user.id, latitude, longitude, updatedAt: Date.now() };
          latestLocations.set(order.id, location);
          publishedOrders.add(order.id);
          publishTracking(order.id, { latitude, longitude, updatedAt: location.updatedAt });
        }
      };
      conn.send({ type: 'hello', topics: ['prices'] });
    },
  });

  app.server = server;
  app.ws = wsHub;
  app.close = async () => {
    await app.ready;
    wsHub.stop();
    offOrderStatus();
    limiter.stop();
    await new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
    if (store.close) await store.close();
  };
  return app;
}
