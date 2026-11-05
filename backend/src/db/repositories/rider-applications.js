export class RiderApplicationsRepository {
  constructor(database, client, users) {
    this.users = database.collection('users');
    this.documents = database.collection('riderDocuments');
    this.client = client;
    this.userRepository = users;
  }

  async create(user, documentId) {
    const source = user.application.license.document;
    const storedUser = {
      ...user,
      application: {
        ...user.application,
        license: {
          ...user.application.license,
          document: { id: documentId, name: source.name, mimeType: source.mimeType, size: source.content.length },
        },
      },
    };
    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        await this.documents.insertOne({
          id: documentId,
          riderId: user.id,
          name: source.name,
          mimeType: source.mimeType,
          content: source.content,
          createdAt: Date.now(),
        }, { session });
        await this.userRepository.insert(storedUser, { session });
      });
    } finally {
      await session.endSession();
    }
    return storedUser;
  }

  list() {
    return this.users.find(
      { role: 'rider', status: 'pending_approval' },
      { projection: {
        _id: 0, id: 1, phone: 1, name: 1, email: 1, role: 1, setupCompleted: 1, prefs: 1, createdAt: 1, appliedAt: 1, status: 1,
        'application.vehicle': 1, 'application.license.number': 1, 'application.license.document.name': 1, 'application.license.document.mimeType': 1,
      } },
    ).sort({ appliedAt: 1, id: 1 }).toArray();
  }

  review(id, status, reviewedBy, note) {
    return this.users.findOneAndUpdate(
      { id, role: 'rider', status: 'pending_approval' },
      { $set: { status, reviewedBy, reviewNote: note, reviewedAt: Date.now(), online: false } },
      { returnDocument: 'after', projection: { _id: 0, id: 1, phone: 1, name: 1, email: 1, role: 1, status: 1, setupCompleted: 1, prefs: 1, createdAt: 1, reviewedAt: 1 } },
    );
  }

  async getLicenseDocument(riderId) {
    const user = await this.users.findOne(
      { id: riderId, role: 'rider' },
      { projection: { _id: 0, 'application.license.document.id': 1 } },
    );
    const documentId = user?.application?.license?.document?.id;
    if (!documentId) return null;
    return this.documents.findOne({ id: documentId, riderId }, { projection: { _id: 0, id: 0, riderId: 0, createdAt: 0 } });
  }
}
