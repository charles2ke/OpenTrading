import assert from "node:assert/strict";
import test from "node:test";
import { AuditRepository, AuthStore, connectDataStore, PortfolioRepository, scrubPii } from "../src/server/portfolio-repository.js";
import { createPortfolio } from "../src/core/trading.js";

function collection(overrides = {}) {
  return {
    createIndex: async () => "index",
    findOne: async () => null,
    findOneAndDelete: async () => null,
    insertOne: async () => ({ acknowledged: true }),
    updateOne: async () => ({ acknowledged: true }),
    deleteOne: async () => ({ acknowledged: true }),
    ...overrides
  };
}

test("portfolio repository initializes, reads, and writes valid data", async () => {
  const calls = [];
  let query = {};
  const data = collection({
    createIndex: async (...args) => calls.push(["index", ...args]),
    findOne: async (...args) => {
      [query] = args;
      return { portfolio: createPortfolio() };
    },
    updateOne: async (...args) => calls.push(["update", ...args])
  });
  const repository = new PortfolioRepository(data, "privacy-key");
  await repository.initialize();
  assert.deepEqual(await repository.find("owner"), createPortfolio());
  await repository.save("owner", createPortfolio());
  assert.match(query.ownerKey, /^owner:[a-f0-9]{64}$/);
  assert.equal(calls[0][0], "index");
  assert.deepEqual(calls[0].slice(1), [{ ownerKey: 1 }, { unique: true }]);
  assert.equal(calls[1][0], "update");
  assert.deepEqual(calls[1][1], { ownerKey: query.ownerKey });
  assert.equal(await new PortfolioRepository(collection()).find("missing"), null);
  await assert.rejects(() => repository.save("owner", {}), /Invalid portfolio/);
});

test("auth store manages short-lived state and sessions", async () => {
  const calls = [];
  const states = collection({
    createIndex: async (...args) => calls.push(["state-index", ...args]),
    insertOne: async (value) => calls.push(["state-insert", value]),
    findOneAndDelete: async () => ({ provider: "google" })
  });
  const sessions = collection({
    createIndex: async (...args) => calls.push(["session-index", ...args]),
    insertOne: async (value) => calls.push(["session-insert", value]),
    findOne: async () => ({ user: { id: "google:1" } }),
    deleteOne: async (value) => calls.push(["session-delete", value])
  });
  const store = new AuthStore(states, sessions);
  await store.initialize();
  await store.saveState("state", { provider: "google" });
  assert.deepEqual(await store.consumeState("state"), { provider: "google" });
  await store.saveSession("session", { user: { id: "google:1", name: "Ada", provider: "google", email: "ada@example.com" } });
  assert.deepEqual(await store.findSession("session"), { user: { id: "google:1" } });
  await store.deleteSession("session");
  const sessionRecord = calls.find(([name]) => name === "session-insert")[1];
  assert.match(sessionRecord.user.id, /^user:[a-f0-9]{64}$/);
  assert.equal(sessionRecord.user.provider, "google");
  assert.equal(sessionRecord.user.name, "Ada");
  assert.equal(sessionRecord.user.email, undefined);
  assert.equal(calls.length, 5);
});

test("audit repository stores scrubbed audit records with retention", async () => {
  const entries = [];
  const indexes = [];
  const repository = new AuditRepository(collection({
    createIndex: async (...args) => indexes.push(args),
    insertOne: async (value) => entries.push(value)
  }), 30, "audit-key");
  await repository.initialize();
  await repository.record({
    action: "portfolio.write",
    actor: "google:123",
    status: "success",
    metadata: { email: "ada@example.com", nested: { sessionToken: "abc" }, symbols: 2 }
  });
  assert.equal(indexes.length, 2);
  assert.equal(entries.length, 1);
  assert.match(entries[0].actor, /^actor:[a-f0-9]{64}$/);
  assert.deepEqual(entries[0].metadata, { email: "[REDACTED]", nested: { sessionToken: "[REDACTED]" }, symbols: 2 });
  assert.ok(entries[0].expiresAt > entries[0].occurredAt);
});

test("scrubs pii recursively", () => {
  assert.deepEqual(scrubPii({
    email: "ada@example.com",
    notes: "safe",
    userName: "Ada",
    nested: [{ clientId: "abc" }, { visible: true }]
  }), {
    email: "[REDACTED]",
    notes: "safe",
    userName: "[REDACTED]",
    nested: [{ clientId: "[REDACTED]" }, { visible: true }]
  });
});

test("connects one MongoDB client for all repositories", async () => {
  const collections = new Map();
  class FakeClient {
    constructor(uri, options) {
      assert.equal(uri, "mongodb://example");
      assert.equal(options.maxPoolSize, 10);
    }
    async connect() {}
    db(name) {
      assert.equal(name, "database");
      return {
        collection: (collectionName) => {
          if (!collections.has(collectionName)) collections.set(collectionName, collection());
          return collections.get(collectionName);
        }
      };
    }
  }
  const stores = await connectDataStore("mongodb://example", "database", FakeClient);
  assert.ok(stores.portfolio instanceof PortfolioRepository);
  assert.ok(stores.auth instanceof AuthStore);
  assert.ok(stores.audit instanceof AuditRepository);
  assert.deepEqual([...collections.keys()], ["portfolios", "authStates", "sessions", "auditEvents"]);
});
