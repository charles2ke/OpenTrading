import assert from "node:assert/strict";
import test from "node:test";
import { AuthStore, connectDataStore, PortfolioRepository } from "../src/server/portfolio-repository.js";
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
  const data = collection({
    createIndex: async (...args) => calls.push(["index", ...args]),
    findOne: async () => ({ portfolio: createPortfolio() }),
    updateOne: async (...args) => calls.push(["update", ...args])
  });
  const repository = new PortfolioRepository(data);
  await repository.initialize();
  assert.deepEqual(await repository.find("owner"), createPortfolio());
  await repository.save("owner", createPortfolio());
  assert.equal(calls[0][0], "index");
  assert.equal(calls[1][0], "update");
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
  await store.saveSession("session", { user: { id: "google:1" } });
  assert.deepEqual(await store.findSession("session"), { user: { id: "google:1" } });
  await store.deleteSession("session");
  assert.equal(calls.length, 5);
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
  assert.deepEqual([...collections.keys()], ["portfolios", "authStates", "sessions"]);
});
