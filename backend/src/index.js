import 'dotenv/config';
import { createApp } from './app.js';

const app = createApp();
await app.ready;
app.server.listen(app.cfg.port, () => console.log(`YoGreen API listening on :${app.cfg.port} (${app.cfg.isProd ? 'production' : 'development'})`));

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`shutting down (${signal})`);
  const timeout = setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  app.close().then(() => {
    clearTimeout(timeout);
    process.exit(0);
  }, (error) => {
    clearTimeout(timeout);
    console.error('[shutdown:error]', error);
    process.exit(1);
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
