import { V, HttpError, notFound } from '../lib/http.js';
import { publicUser } from '../lib/public-user.js';

const ok = (body, status = 200) => ({ status, body });

export function createRiderApplicationsController({ store }) {
  return {
    async list() {
      const applications = await store.listRiderApplications();
      return ok({ items: applications.map((user) => ({
        ...publicUser(user),
        status: user.status,
        appliedAt: user.appliedAt,
        vehicle: user.application.vehicle,
        license: {
          number: user.application.license.number,
          documentName: user.application.license.document.name,
          mimeType: user.application.license.document.mimeType,
        },
      })) });
    },
    async getLicense({ user: actor, params }) {
      const riderId = V.str(params, 'id', { max: 64 });
      const document = await store.getRiderLicenseDocument(riderId);
      if (!document) throw notFound('Rider application not found');
      await store.appendAudit(actor.id, 'rider.application.document.view', { riderId });
      const { name, mimeType, content } = document;
      const bytes = Buffer.isBuffer(content)
        ? content
        : Buffer.from(typeof content.value === 'function' ? content.value() : content.buffer);
      return ok({ name, mimeType, base64: bytes.toString('base64') });
    },
    async review({ user: actor, params, body }) {
      const riderId = V.str(params, 'id', { max: 64 });
      const decision = V.oneOf(body, 'decision', ['approve', 'reject']);
      const note = V.str(body, 'note', { max: 300, optional: true });
      if (decision === 'reject' && !note) throw new HttpError(422, 'validation_error', 'note: required when rejecting an application');
      const status = decision === 'approve' ? 'active' : 'rejected';
      const updated = await store.reviewRiderApplication(riderId, status, actor.id, note || '');
      if (!updated) {
        const existing = await store.findUser(riderId);
        if (!existing || existing.role !== 'rider') throw notFound('Rider application not found');
        throw new HttpError(409, 'application_already_reviewed', 'This rider application has already been reviewed');
      }
      await store.appendAudit(actor.id, `rider.application.${decision}`, { riderId, note: note || '' });
      return ok({ rider: { ...publicUser(updated), status: updated.status, reviewedAt: updated.reviewedAt } });
    },
  };
}
