import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_CURRENCY,
  convertAmount,
  exchangeRate,
  normalizeCurrency,
  normalizeRateTable,
  requestedCurrencies
} from "../src/core/fx.js";

const table = normalizeRateTable({ base: "usd", asOf: "2026-01-05T09:00:00.000Z", rates: { EUR: 0.9, GBP: "0.8", JPY: 150 } });

test("normalizes ISO 4217 currency codes", () => {
  assert.equal(normalizeCurrency(" eur "), "EUR");
  assert.equal(normalizeCurrency("EURO"), "");
  assert.equal(normalizeCurrency(42), "");
  assert.equal(BASE_CURRENCY, "USD");
});

test("normalizes a rate table and drops invalid entries", () => {
  assert.equal(table.base, "USD");
  assert.equal(table.asOf, "2026-01-05T09:00:00.000Z");
  assert.deepEqual(table.rates, { USD: 1, EUR: 0.9, GBP: 0.8, JPY: 150 });
  const fallback = normalizeRateTable({ rates: { EUR: 0, GB: 1, CHF: "abc", CAD: 1.4 } }, "gbp");
  assert.equal(fallback.base, "GBP");
  assert.deepEqual(fallback.rates, { GBP: 1, CAD: 1.4 });
  assert.ok(!Number.isNaN(Date.parse(fallback.asOf)));
  assert.equal(normalizeRateTable(null, "dollars"), null);
  assert.deepEqual(normalizeRateTable({ base: "USD" }).rates, { USD: 1 });
});

test("computes exchange rates between currencies", () => {
  assert.equal(exchangeRate("USD", "USD", table), 1);
  assert.equal(exchangeRate("USD", "EUR", table), 0.9);
  assert.equal(exchangeRate("EUR", "GBP", table), 0.8 / 0.9);
  assert.equal(exchangeRate("EUR", "MXN", table), null);
  assert.equal(exchangeRate("MXN", "EUR", table), null);
  assert.equal(exchangeRate("", "EUR", table), null);
  assert.equal(exchangeRate("EUR", "", table), null);
  assert.equal(exchangeRate("EUR", "USD", null), null);
});

test("converts amounts and rounds to two decimals", () => {
  assert.equal(convertAmount(100, "USD", "EUR", table), 90);
  assert.equal(convertAmount("150", "JPY", "USD", table), 1);
  assert.equal(convertAmount(10, "USD", "USD", table), 10);
  assert.equal(convertAmount(10, "USD", "MXN", table), null);
  assert.equal(convertAmount("abc", "USD", "EUR", table), null);
  assert.equal(convertAmount(true, "USD", "EUR", table), null);
});

test("parses requested currency lists", () => {
  assert.deepEqual(requestedCurrencies("eur, gbp,EUR,,eu"), ["EUR", "GBP"]);
  assert.deepEqual(requestedCurrencies(null), []);
  const many = Array.from({ length: 30 }, (_, index) => `A${String.fromCharCode(65 + index)}A`).join(",");
  assert.equal(requestedCurrencies(many).length, 25);
});
