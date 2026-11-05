export function registerHealthRoutes(router) {
  router.add('GET', '/health', {}, () => ({ status: 200, body: { status: 'ok', uptime: Math.round(process.uptime()) } }));
}
