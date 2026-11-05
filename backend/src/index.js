import 'dotenv/config';
import { createApp } from './app.js';

const app = createApp();
await app.ready;
app.server.listen(app.cfg.port, () => console.log(`YoGreen API listening on :${app.cfg.port} (${app.cfg.isProd ? 'production' : 'development'})`));

const shutdown = () => { console.log('shutting down'); app.close().then(() => process.exit(0)); setTimeout(() => process.exit(1), 10_000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
