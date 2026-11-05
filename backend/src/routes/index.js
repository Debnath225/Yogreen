import { registerAdminRoutes } from './admin.js';
import { registerAdminRiderRoutes } from './admin-riders.js';
import { registerAuthRoutes } from './auth.js';
import { registerHealthRoutes } from './health.js';
import { registerProfileRoutes } from './profile.js';
import { registerRiderRoutes } from './rider.js';
import { registerShopRoutes } from './shop.js';
import { registerWalletRoutes } from './wallet.js';

export function registerRoutes(app) {
  registerHealthRoutes(app.router);
  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerShopRoutes(app);
  registerWalletRoutes(app);
  registerAdminRoutes(app);
  registerAdminRiderRoutes(app);
  registerRiderRoutes(app);
}
