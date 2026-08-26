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

export async function connectPortfolioRepository(uri, databaseName = "opentrading") {
  const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000
  });
  await client.connect();
  const repository = new PortfolioRepository(client.db(databaseName).collection("portfolios"));
  await repository.initialize();
  return repository;
}
