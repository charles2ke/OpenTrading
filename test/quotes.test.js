import assert from "node:assert/strict";
import test from "node:test";
import { MAX_QUOTE_SYMBOLS, isQuote, mergeQuotes, normalizeQuote, quotesBySymbol } from "../src/core/quotes.js";

const instruments = [
  { symbol: "AAPL", name: "Apple", price: 232.14, previousClose: 228.76 },
  { symbol: "MSFT", name: "Microsoft", price: 418.79, previousClose: 420.43 }
];

test("normalizes a complete quote", () => {
  const quote = normalizeQuote({ price: "101.5", previousClose: 100, currency: " usd ", asOf: "2026-01-05T09:00:00.000Z" }, " aapl ");
  assert.deepEqual(quote, {
    symbol: "AAPL",
    price: 101.5,
    previousClose: 100,
    currency: "USD",
    asOf: "2026-01-05T09:00:00.000Z"
  });
});

test("rejects malformed quotes and falls back to sensible defaults", () => {
  assert.equal(normalizeQuote({ price: 10 }, ""), null);
  assert.equal(normalizeQuote({ price: 10 }, 7), null);
  assert.equal(normalizeQuote(null, "AAPL"), null);
  assert.equal(normalizeQuote({ price: 0 }, "AAPL"), null);
  assert.equal(normalizeQuote({ price: -5 }, "AAPL"), null);
  assert.equal(normalizeQuote({ price: "not-a-number" }, "AAPL"), null);
  assert.equal(normalizeQuote({ price: {} }, "AAPL"), null);

  const fallback = normalizeQuote({ price: 10, previousClose: "x", currency: 5, asOf: "nonsense" }, "AAPL");
  assert.equal(fallback.previousClose, 10);
  assert.equal(fallback.currency, "");
  assert.ok(!Number.isNaN(Date.parse(fallback.asOf)));
});

test("validates quote shapes", () => {
  const quote = normalizeQuote({ price: 10, asOf: "2026-01-05T09:00:00.000Z" }, "AAPL");
  assert.equal(isQuote(quote), true);
  assert.equal(isQuote(null), false);
  assert.equal(isQuote("AAPL"), false);
  assert.equal(isQuote({ ...quote, symbol: "" }), false);
  assert.equal(isQuote({ ...quote, price: 0 }), false);
  assert.equal(isQuote({ ...quote, previousClose: -1 }), false);
  assert.equal(isQuote({ ...quote, asOf: "nonsense" }), false);
});

test("indexes only valid quotes by symbol", () => {
  const index = quotesBySymbol([
    { symbol: "aapl", price: 10, previousClose: 9, asOf: "2026-01-05T09:00:00.000Z" },
    { symbol: "MSFT", price: 0, previousClose: 9, asOf: "2026-01-05T09:00:00.000Z" }
  ]);
  assert.deepEqual([...index.keys()], ["AAPL"]);
  assert.equal(quotesBySymbol().size, 0);
});

test("merges live quotes over cached instrument prices", () => {
  const merged = mergeQuotes(instruments, [
    { symbol: "AAPL", price: 240, previousClose: 235, asOf: "2026-01-05T09:00:00.000Z" }
  ]);
  assert.deepEqual(merged[0], {
    symbol: "AAPL",
    name: "Apple",
    price: 240,
    previousClose: 235,
    asOf: "2026-01-05T09:00:00.000Z",
    source: "live"
  });
  assert.deepEqual(merged[1], { ...instruments[1], source: "cached" });
});

test("caps the number of requested symbols", () => {
  assert.equal(MAX_QUOTE_SYMBOLS, 25);
});
