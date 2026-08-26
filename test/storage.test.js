import assert from "node:assert/strict";
import test from "node:test";
import { createPortfolio } from "../src/core/trading.js";
import { loadPortfolio, savePortfolio, STORAGE_KEY } from "../src/core/storage.js";

function memoryStorage(value = null) {
  return {
    value,
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return this.value;
    },
    setItem(key, nextValue) {
      assert.equal(key, STORAGE_KEY);
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
