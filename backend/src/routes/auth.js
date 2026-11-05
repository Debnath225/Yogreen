import { createAuthController, authControllerOptions } from '../controllers/auth.js';

export function registerAuthRoutes(app) {
  const controller = createAuthController(app);
  app.router.add('POST', '/v1/auth/otp/send', { rate: controller.authRate }, controller.sendOtp);
  app.router.add('POST', '/v1/auth/otp/verify', {
    rate: controller.authRate,
    bodyBytes: authControllerOptions.verifyBodyBytes,
  }, controller.verifyOtp);
  app.router.add('POST', '/v1/auth/refresh', { rate: controller.authRate }, controller.refresh);
  app.router.add('POST', '/v1/auth/logout', { auth: true }, controller.logout);
}
