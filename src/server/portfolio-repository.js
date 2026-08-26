import { MongoClient, ServerApiVersion } from "mongodb";
import { isPortfolio } from "../core/trading.js";

export class PortfolioRepository {
  constructor(collection) {
    this.collection = collection;
  }

  async initialize() {
    await this.collection.createIndex({ clientId: 1 }, { unique: true });
  }

  async find(clientId) {
    const document = await this.collection.findOne({ clientId }, { projection: { _id: 0, portfolio: 1 } });
    return document?.portfolio ?? null;
  }

  async save(clientId, portfolio) {
    if (!isPortfolio(portfolio)) throw new TypeError("Invalid portfolio.");
    await this.collection.updateOne(
      { clientId },
      { $set: { portfolio, updatedAt: new Date() } },
      { upsert: true }
    );
  }
}

export class AuthStore {
  constructor(states, sessions) {
    this.states = states;
    this.sessions = sessions;
  }

  async initialize() {
    await Promise.all([
      this.states.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]);
  }

  async saveState(state, value) {
    await this.states.insertOne({ _id: state, ...value });
  }

  async consumeState(state) {
    return this.states.findOneAndDelete({ _id: state });
  }

  async saveSession(id, value) {
    await this.sessions.insertOne({ _id: id, ...value });
  }

  async findSession(id) {
    return this.sessions.findOne({ _id: id, expiresAt: { $gt: new Date() } }, { projection: { _id: 0, user: 1 } });
  }

  async deleteSession(id) {
    await this.sessions.deleteOne({ _id: id });
  }
}

export async function connectDataStore(uri, databaseName = "opentrading", Client = MongoClient) {
  const client = new Client(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000
  });
  await client.connect();
  const database = client.db(databaseName);
  const portfolio = new PortfolioRepository(database.collection("portfolios"));
  const auth = new AuthStore(database.collection("authStates"), database.collection("sessions"));
  await Promise.all([portfolio.initialize(), auth.initialize()]);
  return { portfolio, auth };
}
