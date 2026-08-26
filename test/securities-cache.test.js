import assert from "node:assert/strict";
import test from "node:test";
import { instruments } from "../src/core/trading.js";
import { createSecuritiesCache, SecuritiesCache } from "../src/server/securities-cache.js";

test("securities cache lists frozen securities", () => {
  const cache = createSecuritiesCache(instruments);
  const securities = cache.list();
  assert.equal(Array.isArray(securities), true);
  assert.equal(securities.length, instruments.length);
  assert.equal(Object.isFrozen(securities), true);
  assert.equal(Object.isFrozen(securities[0]), true);
});

test("securities cache resolves identifiers case-insensitively", () => {
  const cache = new SecuritiesCache(instruments);
  assert.equal(cache.findByIdentifier("symbol", "aapl")?.name, "Apple");
  assert.equal(cache.findByIdentifier("ticker", " msft ")?.name, "Microsoft");
  assert.equal(cache.findByIdentifier("isin", "US88160R1014")?.name, "Tesla");
  assert.equal(cache.findByIdentifier("cusip", "892331307")?.name, "Toyota Motor");
  assert.equal(cache.findByIdentifier("sedol", "0540528")?.name, "HSBC");
});

test("securities cache returns null for unsupported or missing identifiers", () => {
  const cache = createSecuritiesCache(instruments);
  assert.equal(cache.findByIdentifier("ric", "AAPL.O"), null);
  assert.equal(cache.findByIdentifier("ticker", ""), null);
  assert.equal(cache.findByIdentifier("ticker", "UNKNOWN"), null);
  assert.equal(cache.findByIdentifier(123, "AAPL"), null);
  assert.equal(cache.findByIdentifier("ticker", null), null);
});
