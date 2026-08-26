import assert from "node:assert/strict";
import test from "node:test";
import { createPortfolio } from "../src/core/trading.js";
import {
  CLIENT_KEY,
  getClientId,
  loadPortfolio,
  loadRemotePortfolio,
  savePortfolio,
  saveRemotePortfolio,
  STORAGE_KEY
} from "../src/core/storage.js";

function memoryStorage(value = null) {
  return {
    value,
    getItem(key) {
      return this.value;
    },
    setItem(key, nextValue) {
      this.key = key;
      this.value = nextValue;
    }
  };
}

test("loads a valid saved portfolio", () => {
  const portfolio = { cash: 500, positions: { AAPL: { quantity: 1, averagePrice: 200 } } };
  assert.deepEqual(loadPortfolio(memoryStorage(JSON.stringify(portfolio))), portfolio);
});

test("falls back for absent, malformed, or invalid data", () => {
  assert.deepEqual(loadPortfolio(memoryStorage()), createPortfolio());
  assert.deepEqual(loadPortfolio(memoryStorage("{")), createPortfolio());
  assert.deepEqual(loadPortfolio(memoryStorage("{}")), createPortfolio());
});

test("saves only valid portfolios", () => {
  const storage = memoryStorage();
  const portfolio = createPortfolio();
  savePortfolio(storage, portfolio);
  assert.deepEqual(JSON.parse(storage.value), portfolio);
  assert.throws(() => savePortfolio(storage, {}), {
    name: "TypeError",
    message: "Refusing to store an invalid portfolio."
  });
});

test("creates and reuses an anonymous client ID", () => {
  const storage = memoryStorage();
  assert.equal(getClientId(storage, () => "00000000-0000-4000-8000-000000000000"), "00000000-0000-4000-8000-000000000000");
  assert.equal(storage.key, CLIENT_KEY);
  assert.equal(getClientId(storage, () => "unused"), storage.value);
  storage.value = "invalid";
  assert.equal(getClientId(storage, () => "11111111-1111-4111-8111-111111111111"), "11111111-1111-4111-8111-111111111111");
});

test("loads remote portfolios and handles unavailable storage", async () => {
  const storage = memoryStorage();
  const portfolio = createPortfolio();
  const request = async (_url, options) => {
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.headers["X-Client-ID"], "00000000-0000-4000-8000-000000000000");
    return { ok: true, status: 200, json: async () => portfolio };
  };
  assert.deepEqual(await loadRemotePortfolio(storage, request, () => "00000000-0000-4000-8000-000000000000"), portfolio);
  for (const status of [404, 503]) {
    assert.equal(await loadRemotePortfolio(storage, async () => ({ status, ok: false }), () => "00000000-0000-4000-8000-000000000000"), null);
  }
  await assert.rejects(
    loadRemotePortfolio(storage, async () => ({ status: 500, ok: false }), () => "00000000-0000-4000-8000-000000000000"),
    /Unable to load/
  );
  await assert.rejects(
    loadRemotePortfolio(storage, async () => ({ status: 200, ok: true, json: async () => ({}) }), () => "00000000-0000-4000-8000-000000000000"),
    /invalid portfolio/
  );
});

test("saves remote portfolios and handles server responses", async () => {
  const storage = memoryStorage();
  const portfolio = createPortfolio();
  const request = async (_url, options) => {
    assert.equal(options.method, "PUT");
    assert.equal(options.credentials, "same-origin");
    assert.deepEqual(JSON.parse(options.body), portfolio);
    return { status: 204, ok: true };
  };
  assert.equal(await saveRemotePortfolio(storage, portfolio, request, () => "00000000-0000-4000-8000-000000000000"), true);
  assert.equal(await saveRemotePortfolio(storage, portfolio, async () => ({ status: 503, ok: false }), () => "00000000-0000-4000-8000-000000000000"), false);
  await assert.rejects(
    saveRemotePortfolio(storage, portfolio, async () => ({ status: 500, ok: false }), () => "00000000-0000-4000-8000-000000000000"),
    /Unable to save/
  );
  await assert.rejects(
    saveRemotePortfolio(storage, {}, request, () => "00000000-0000-4000-8000-000000000000"),
    /Refusing to send/
  );
});
