import { MongoClient, ServerApiVersion } from "mongodb";
import { createHmac } from "node:crypto";
import { isPortfolio } from "../core/trading.js";

const DEFAULT_PRIVACY_KEY = "opentrading-privacy";
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SENSITIVE_KEY_PATTERN = /(cookie|token|secret|password|email|subject|clientId|sessionId|ownerId|identity|authorization|fullName|firstName|lastName|displayName|userName|iban|bic|accountNumber|sortCode|routingNumber)/i;

function pseudonymizeIdentifier(value, privacyKey = DEFAULT_PRIVACY_KEY) {
  return createHmac("sha256", privacyKey).update(String(value)).digest("hex");
}

export function scrubPii(value, depth = 0) {
  if (depth > 6) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => scrubPii(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" && EMAIL_PATTERN.test(value) ? "[REDACTED]" : value;
  return Object.fromEntries(Object.entries(value).map(([key, current]) => [
    key,
    SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : scrubPii(current, depth + 1)
  ]));
}

export class PortfolioRepository {
  constructor(collection, privacyKey = DEFAULT_PRIVACY_KEY) {
    this.collection = collection;
    this.privacyKey = privacyKey;
  }

  ownerKey(clientId) {
    return `owner:${pseudonymizeIdentifier(clientId, this.privacyKey)}`;
  }

  async initialize() {
    await this.collection.createIndex({ ownerKey: 1 }, { unique: true });
  }

  async find(clientId) {
    const document = await this.collection.findOne({ ownerKey: this.ownerKey(clientId) }, { projection: { _id: 0, portfolio: 1 } });
    return document?.portfolio ?? null;
  }

  async save(clientId, portfolio) {
    if (!isPortfolio(portfolio)) throw new TypeError("Invalid portfolio.");
    const now = new Date();
    await this.collection.updateOne(
      { ownerKey: this.ownerKey(clientId) },
      { $set: { portfolio, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
  }
}

export class BankConnectionRepository {
  constructor(collection, privacyKey = DEFAULT_PRIVACY_KEY) {
    this.collection = collection;
    this.privacyKey = privacyKey;
  }

  ownerKey(clientId) {
    return `owner:${pseudonymizeIdentifier(clientId, this.privacyKey)}`;
  }

  async initialize() {
    await this.collection.createIndex({ ownerKey: 1, connectionId: 1 }, { unique: true });
  }

  async link(clientId, connection) {
    const now = new Date();
    await this.collection.updateOne(
      { ownerKey: this.ownerKey(clientId), connectionId: String(connection.id).slice(0, 64) },
      {
        $set: {
          institutionId: String(connection.institutionId || "").slice(0, 64),
          status: connection.status === "linked" ? "linked" : "pending",
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );
  }

  async list(clientId) {
    return this.collection
      .find({ ownerKey: this.ownerKey(clientId) }, { projection: { _id: 0, connectionId: 1, institutionId: 1, status: 1 } })
      .toArray();
  }

  async owns(clientId, connectionId) {
    const document = await this.collection.findOne(
      { ownerKey: this.ownerKey(clientId), connectionId: String(connectionId).slice(0, 64) },
      { projection: { _id: 0, connectionId: 1 } }
    );
    return Boolean(document);
  }

  async unlink(clientId, connectionId) {
    const result = await this.collection.deleteOne({ ownerKey: this.ownerKey(clientId), connectionId: String(connectionId).slice(0, 64) });
    return result.deletedCount > 0;
  }
}

export class AuthStore {
  constructor(states, sessions, privacyKey = DEFAULT_PRIVACY_KEY) {
    this.states = states;
    this.sessions = sessions;
    this.privacyKey = privacyKey;
  }

  pseudonymousUserId(value) {
    return `user:${pseudonymizeIdentifier(value, this.privacyKey)}`;
  }

  sanitizeUser(user = {}) {
    return {
      id: this.pseudonymousUserId(user.id || "anonymous"),
      name: String(user.name || "Trader").slice(0, 100),
      provider: String(user.provider || "unknown").slice(0, 32)
    };
  }

  async initialize() {
    await Promise.all([
      this.states.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]);
  }

  async saveState(state, value) {
    await this.states.insertOne({
      _id: state,
      provider: value.provider,
      codeVerifier: value.codeVerifier,
      expiresAt: value.expiresAt,
      createdAt: new Date()
    });
  }

  async consumeState(state) {
    return this.states.findOneAndDelete({ _id: state });
  }

  async saveSession(id, value) {
    await this.sessions.insertOne({
      _id: id,
      user: this.sanitizeUser(value.user),
      expiresAt: value.expiresAt,
      createdAt: new Date()
    });
  }

  async findSession(id) {
    return this.sessions.findOne({ _id: id, expiresAt: { $gt: new Date() } }, { projection: { _id: 0, user: 1 } });
  }

  async deleteSession(id) {
    await this.sessions.deleteOne({ _id: id });
  }
}

export class AuditRepository {
  constructor(collection, retentionDays = 365, privacyKey = DEFAULT_PRIVACY_KEY) {
    this.collection = collection;
    this.retentionDays = Math.min(3_650, Math.max(1, Number.isFinite(retentionDays) ? retentionDays : 365));
    this.privacyKey = privacyKey;
  }

  async initialize() {
    await Promise.all([
      this.collection.createIndex({ occurredAt: 1 }),
      this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]);
  }

  async record(event) {
    const occurredAt = event.occurredAt instanceof Date ? event.occurredAt : new Date();
    const expiresAt = new Date(occurredAt.getTime() + (this.retentionDays * 24 * 60 * 60 * 1000));
    await this.collection.insertOne({
      action: String(event.action || "unknown").slice(0, 120),
      actor: event.actor ? `actor:${pseudonymizeIdentifier(event.actor, this.privacyKey)}` : "actor:anonymous",
      status: event.status === "failure" ? "failure" : "success",
      metadata: scrubPii(event.metadata || {}),
      occurredAt,
      expiresAt
    });
  }
}

export async function connectDataStore(uri, databaseName = "opentrading", Client = MongoClient) {
  const privacyKey = process.env.DATA_PRIVACY_KEY || DEFAULT_PRIVACY_KEY;
  if (!process.env.DATA_PRIVACY_KEY && process.env.NODE_ENV !== "test") {
    console.warn("DATA_PRIVACY_KEY is not configured. Using default development key; set DATA_PRIVACY_KEY for production.");
  }
  const client = new Client(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000
  });
  await client.connect();
  const database = client.db(databaseName);
  const portfolio = new PortfolioRepository(database.collection("portfolios"), privacyKey);
  const auth = new AuthStore(database.collection("authStates"), database.collection("sessions"), privacyKey);
  const audit = new AuditRepository(database.collection("auditEvents"), Number(process.env.AUDIT_RETENTION_DAYS || 365), privacyKey);
  const bank = new BankConnectionRepository(database.collection("bankConnections"), privacyKey);
  await Promise.all([portfolio.initialize(), auth.initialize(), audit.initialize(), bank.initialize()]);
  return { portfolio, auth, audit, bank };
}
