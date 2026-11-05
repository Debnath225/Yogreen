import { createRiderApplicationsController } from '../controllers/rider-applications.js';

const STAFF = ['admin', 'super_admin'];

export function registerAdminRiderRoutes(app) {
  const { router } = app;
  const staff = { auth: true, roles: STAFF };
  const controller = createRiderApplicationsController(app);
  router.add('GET', '/v1/admin/riders/applications', staff, controller.list);
  router.add('GET', '/v1/admin/riders/:id/license', staff, controller.getLicense);
  router.add('PATCH', '/v1/admin/riders/:id/review', staff, controller.review);
}
