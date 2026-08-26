import assert from "node:assert/strict";
import test from "node:test";
import { AuditRepository, AuthStore, BankConnectionRepository, connectDataStore, PortfolioRepository, scrubPii } from "../src/server/portfolio-repository.js";
import { createPortfolio } from "../src/core/trading.js";

function collection(overrides = {}) {
  return {
    createIndex: async () => "index",
    findOne: async () => null,
    findOneAndDelete: async () => null,
    insertOne: async () => ({ acknowledged: true }),
    updateOne: async () => ({ acknowledged: true }),
    deleteOne: async () => ({ deletedCount: 1 }),
    find: () => ({ toArray: async () => [] }),
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
  await store.saveSession("session", { user: { id: "google:1", name: "A".repeat(120), provider: "google", email: "ada@example.com" } });
  assert.deepEqual(await store.findSession("session"), { user: { id: "google:1" } });
  await store.deleteSession("session");
  const sessionRecord = calls.find(([name]) => name === "session-insert")[1];
  assert.match(sessionRecord.user.id, /^user:[a-f0-9]{64}$/);
  assert.equal(sessionRecord.user.provider, "google");
  assert.equal(sessionRecord.user.name, "A".repeat(100));
  assert.equal(sessionRecord.user.email, undefined);
  assert.equal(calls.length, 5);
});

test("auth store normalizes missing user fields", async () => {
  let sessionValue;
  const store = new AuthStore(collection(), collection({
    insertOne: async (value) => { sessionValue = value; }
  }), "privacy-key");
  await store.saveSession("session", { user: {}, expiresAt: new Date(Date.now() + 1_000) });
  assert.match(sessionValue.user.id, /^user:[a-f0-9]{64}$/);
  assert.equal(sessionValue.user.name, "Trader");
  assert.equal(sessionValue.user.provider, "unknown");
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

test("audit repository handles failure events and anonymous actors", async () => {
  const entries = [];
  const occurredAt = new Date("2025-01-01T00:00:00.000Z");
  const repository = new AuditRepository(collection({
    createIndex: async () => "index",
    insertOne: async (value) => entries.push(value)
  }), Number.NaN, "audit-key");
  await repository.initialize();
  await repository.record({
    status: "failure",
    occurredAt,
    metadata: null
  });
  assert.equal(entries[0].action, "unknown");
  assert.equal(entries[0].actor, "actor:anonymous");
  assert.equal(entries[0].status, "failure");
  assert.deepEqual(entries[0].metadata, {});
  assert.equal(entries[0].occurredAt.toISOString(), occurredAt.toISOString());
  assert.equal(entries[0].expiresAt.toISOString(), new Date("2026-01-01T00:00:00.000Z").toISOString());
});

test("audit repository caps excessive retention periods", async () => {
  const entries = [];
  const occurredAt = new Date("2025-01-01T00:00:00.000Z");
  const repository = new AuditRepository(collection({
    createIndex: async () => "index",
    insertOne: async (value) => entries.push(value)
  }), 100_000, "audit-key");
  await repository.initialize();
  await repository.record({ occurredAt, metadata: {} });
  assert.equal(entries[0].expiresAt.toISOString(), new Date("2034-12-30T00:00:00.000Z").toISOString());
});

test("audit repository lists an actor's own scrubbed events", async () => {
  const queries = [];
  const data = collection({
    find: (query, options) => {
      queries.push([query, options]);
      return {
        toArray: async () => [
          { action: "portfolio.read", actor: query.actor, status: "success", metadata: { email: "ada@example.com" }, occurredAt: new Date("2026-01-05T09:00:00.000Z") },
          { action: "auth.logout", actor: query.actor, status: "failure", metadata: null, occurredAt: "2026-01-04T09:00:00.000Z" },
          { action: "auth.session.read", actor: query.actor, status: "success", metadata: {} }
        ]
      };
    }
  });
  const repository = new AuditRepository(data, 30, "audit-key");
  const events = await repository.listForActor("google:123", 5);
  assert.match(queries[0][0].actor, /^actor:[a-f0-9]{64}$/);
  assert.equal(queries[0][1].limit, 5);
  assert.deepEqual(queries[0][1].sort, { occurredAt: -1 });
  assert.deepEqual(events[0], {
    action: "portfolio.read",
    actor: queries[0][0].actor,
    status: "success",
    metadata: { email: "[REDACTED]" },
    occurredAt: "2026-01-05T09:00:00.000Z"
  });
  assert.deepEqual(events[1].metadata, {});
  assert.equal(events[1].occurredAt, "2026-01-04T09:00:00.000Z");
  assert.equal(events[2].occurredAt, "");
  await repository.listForActor("", Number.NaN);
  assert.equal(queries[1][0].actor, "actor:anonymous");
  assert.equal(queries[1][1].limit, 200);
  await repository.listForActor("google:123", 100_000);
  assert.equal(queries[2][1].limit, 1_000);
  await repository.listForActor("google:123", 0);
  assert.equal(queries[3][1].limit, 1);
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
  assert.equal(scrubPii("ada@example.com"), "[REDACTED]");
  assert.equal(scrubPii({ a: { b: { c: { d: { e: { f: { g: "value" } } } } } } }).a.b.c.d.e.f.g, "[REDACTED]");
});

test("connects one MongoDB client for all repositories", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
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
  try {
    const stores = await connectDataStore("mongodb://example", "database", FakeClient);
    assert.ok(stores.portfolio instanceof PortfolioRepository);
    assert.ok(stores.auth instanceof AuthStore);
    assert.ok(stores.audit instanceof AuditRepository);
    assert.ok(stores.bank instanceof BankConnectionRepository);
    assert.deepEqual([...collections.keys()], ["portfolios", "authStates", "sessions", "auditEvents", "bankConnections"]);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("connectDataStore uses privacy and retention environment overrides", async () => {
  const previousPrivacyKey = process.env.DATA_PRIVACY_KEY;
  const previousRetentionDays = process.env.AUDIT_RETENTION_DAYS;
  process.env.DATA_PRIVACY_KEY = "override-key";
  process.env.AUDIT_RETENTION_DAYS = "7";
  class FakeClient {
    async connect() {}
    db() {
      return { collection: () => collection() };
    }
  }
  try {
    const stores = await connectDataStore("mongodb://example", "database", FakeClient);
    assert.ok(stores.portfolio instanceof PortfolioRepository);
    assert.ok(stores.auth instanceof AuthStore);
    assert.ok(stores.audit instanceof AuditRepository);
    assert.ok(stores.bank instanceof BankConnectionRepository);
  } finally {
    process.env.DATA_PRIVACY_KEY = previousPrivacyKey;
    process.env.AUDIT_RETENTION_DAYS = previousRetentionDays;
  }
});

test("connectDataStore warns when privacy key is missing outside tests", async () => {
  const previousPrivacyKey = process.env.DATA_PRIVACY_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const messages = [];
  process.env.DATA_PRIVACY_KEY = "";
  process.env.NODE_ENV = "production";
  const previousWarn = console.warn;
  console.warn = (...args) => messages.push(args.join(" "));
  class FakeClient {
    async connect() {}
    db() {
      return { collection: () => collection() };
    }
  }
  try {
    await connectDataStore("mongodb://example", "database", FakeClient);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /DATA_PRIVACY_KEY is not configured/);
  } finally {
    console.warn = previousWarn;
    process.env.DATA_PRIVACY_KEY = previousPrivacyKey;
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("bank connection repository stores only pseudonymous connection references", async () => {
  const calls = [];
  let listQuery;
  const longConnectionId = "connection-".padEnd(80, "x");
  const truncatedLongConnectionId = longConnectionId.slice(0, 64);
  const data = collection({
    createIndex: async (...args) => calls.push(["index", ...args]),
    updateOne: async (...args) => calls.push(["update", ...args]),
    find: (query, options) => {
      listQuery = { query, options };
      return { toArray: async () => [{ connectionId: "conn-1", institutionId: "commerzbank", status: "linked" }] };
    },
    findOne: async (query) => (query.connectionId === "conn-1" || query.connectionId === truncatedLongConnectionId
      ? { connectionId: query.connectionId }
      : null)
  });
  const repository = new BankConnectionRepository(data, "privacy-key");
  await repository.initialize();
  await repository.link("owner", { id: "conn-1", institutionId: "commerzbank", status: "linked" });
  await repository.link("owner", { id: longConnectionId, status: "unknown" });

  assert.deepEqual(calls[0].slice(1), [{ ownerKey: 1, connectionId: 1 }, { unique: true }]);
  const [, linkedFilter, linkedUpdate] = calls[1];
  assert.match(linkedFilter.ownerKey, /^owner:[a-f0-9]{64}$/);
  assert.equal(linkedFilter.connectionId, "conn-1");
  assert.equal(linkedUpdate.$set.status, "linked");
  assert.equal(calls[2][1].connectionId, truncatedLongConnectionId);
  assert.equal(calls[2][2].$set.status, "pending");
  assert.equal(calls[2][2].$set.institutionId, "");

  assert.deepEqual(await repository.list("owner"), [{ connectionId: "conn-1", institutionId: "commerzbank", status: "linked" }]);
  assert.deepEqual(listQuery.options.projection, { _id: 0, connectionId: 1, institutionId: 1, status: 1 });
  assert.equal(await repository.owns("owner", "conn-1"), true);
  assert.equal(await repository.owns("owner", "conn-9"), false);
  assert.equal(await repository.owns("owner", longConnectionId), true);
  assert.equal(await repository.unlink("owner", "conn-1"), true);
  assert.equal(await repository.unlink("owner", longConnectionId), true);
  assert.equal(await new BankConnectionRepository(collection({ deleteOne: async () => ({ deletedCount: 0 }) })).unlink("owner", "conn-1"), false);
});

test("audit metadata redacts bank identifiers", () => {
  assert.deepEqual(scrubPii({ iban: "DE89370400440532013000", bic: "COBADEFF", scheme: "SEPA" }), {
    iban: "[REDACTED]",
    bic: "[REDACTED]",
    scheme: "SEPA"
  });
});
