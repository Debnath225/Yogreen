export class UserRepository {
  constructor(database) {
    this.users = database.collection('users');
  }

  findByPhone(phone) {
    return this.users.findOne({ phone }, { projection: { _id: 0 } });
  }

  findById(id) {
    return this.users.findOne({ id }, { projection: { _id: 0 } });
  }

  async insert(user, options = {}) {
    await this.users.insertOne({ ...user }, options);
    return user;
  }

  async createIfAbsent(user) {
    try {
      await this.users.updateOne({ phone: user.phone }, { $setOnInsert: user }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    return this.findByPhone(user.phone);
  }

  async save(user) {
    await this.users.replaceOne({ id: user.id }, user, { upsert: true });
    return user;
  }

  async patch(id, changes) {
    await this.users.updateOne({ id }, { $set: changes });
    return this.findById(id);
  }
}
