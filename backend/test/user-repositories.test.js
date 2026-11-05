import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRepository } from '../src/db/repositories/users.js';
import { RiderApplicationsRepository } from '../src/db/repositories/rider-applications.js';

class MemoryCollection {
  constructor() { this.rows = new Map(); }
  async insertOne(document) {
    this.rows.set(document.id, structuredClone(document));
  }
  async updateOne(filter, update) {
    if (!this.rows.has(filter.phone)) this.rows.set(filter.phone, structuredClone(update.$setOnInsert));
  }
  async findOne(filter) {
    const row = [...this.rows.values()].find((item) =>
      (filter.phone === undefined || item.phone === filter.phone)
      && (filter.id === undefined || item.id === filter.id)
      && (filter.role === undefined || item.role === filter.role)
      && (filter.riderId === undefined || item.riderId === filter.riderId));
    if (!row) return null;
    if (filter.role === 'rider' && filter.id) return { application: { license: { document: { id: row.application.license.document.id } } } };
    return structuredClone(row);
  }
  findOneAndUpdate() { throw new Error('not used in this test'); }
}

test('Mongo repositories persist users and store license bytes outside user documents', async () => {
  const collections = new Map();
  const database = {
    collection(name) {
      if (!collections.has(name)) collections.set(name, new MemoryCollection());
      return collections.get(name);
    },
  };
  const client = {
    startSession() {
      return { async withTransaction(operation) { await operation(); }, async endSession() {} };
    },
  };
  const users = new UserRepository(database);
  const riders = new RiderApplicationsRepository(database, client, users);
  const customer = { id: 'customer-1', phone: '+919830012345', role: 'customer', status: 'active' };
  await users.insert(customer);
  assert.deepEqual(await users.findByPhone(customer.phone), customer);

  const content = Buffer.from('%PDF-1.4 license');
  const rider = await riders.create({
    id: 'rider-1',
    phone: '+919830054321',
    name: 'Rider Applicant',
    role: 'rider',
    status: 'pending_approval',
    application: {
      vehicle: { type: 'motorcycle', makeModel: 'Honda Activa', registration: 'WB01AB1234' },
      license: { number: 'WB0120200012345', document: { name: 'license.pdf', mimeType: 'application/pdf', content } },
    },
  }, 'document-1');
  assert.deepEqual(rider.application.license.document, {
    id: 'document-1', name: 'license.pdf', mimeType: 'application/pdf', size: content.length,
  });
  const savedUser = await users.findByPhone(rider.phone);
  assert.equal(savedUser.id, rider.id);
  assert.deepEqual(savedUser.application.license.document, rider.application.license.document);
  const savedDocument = await riders.getLicenseDocument(rider.id);
  assert.equal(savedDocument.name, 'license.pdf');
  assert.equal(savedDocument.mimeType, 'application/pdf');
  assert.deepEqual(Buffer.from(savedDocument.content), content);
});
