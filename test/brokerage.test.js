import assert from "node:assert/strict";
import test from "node:test";
import {
  BROKER_ID,
  brokerSymbol,
  normalizeBrokerCash,
  normalizeBrokerCurrency,
  normalizeBrokerPosition,
  normalizeBrokerPositions,
  summarizeBrokerAccount
} from "../src/core/brokerage.js";

test("normalizes Trading 212 tickers and currencies", () => {
  assert.equal(brokerSymbol("aapl_us_eq"), "AAPL_US_EQ");
  assert.equal(brokerSymbol("<script>"), "SCRIPT");
  assert.equal(brokerSymbol(undefined), "");
  assert.equal(normalizeBrokerCurrency("gbp"), "GBP");
  assert.equal(normalizeBrokerCurrency("XXX"), "");
  assert.equal(normalizeBrokerCurrency(undefined), "");
});

test("normalizes a single position and rejects unusable ones", () => {
  assert.deepEqual(normalizeBrokerPosition({ ticker: "AAPL", quantity: 3, averagePrice: 100, currentPrice: 110, ppl: 30 }), {
    symbol: "AAPL",
    quantity: 3,
    averagePrice: 100,
    price: 110,
    value: 330,
    returnValue: 30
  });
  assert.equal(normalizeBrokerPosition({ ticker: "AAPL", quantity: 0 }), null);
  assert.equal(normalizeBrokerPosition({ ticker: "", quantity: 2 }), null);
  assert.equal(normalizeBrokerPosition({ ticker: "AAPL", quantity: "many" }), null);
  const derived = normalizeBrokerPosition({ ticker: "MSFT", quantity: 2, averagePrice: 100, currentPrice: 120 });
  assert.equal(derived.returnValue, 40);
  assert.equal(normalizeBrokerPosition({ ticker: "TSLA", quantity: 1 }).price, 0);
});

test("normalizes position collections", () => {
  assert.deepEqual(normalizeBrokerPositions(null), []);
  assert.equal(normalizeBrokerPositions([{ ticker: "AAPL", quantity: 1 }, { ticker: "", quantity: 1 }]).length, 1);
});

test("normalizes the cash payload", () => {
  assert.deepEqual(normalizeBrokerCash({ free: 100.005, invested: 50, total: 150, ppl: 2.5 }, "eur"), {
    currency: "EUR",
    free: 100.01,
    invested: 50,
    total: 150,
    result: 2.5
  });
  assert.deepEqual(normalizeBrokerCash({ result: 4 }), { currency: "", free: 0, invested: 0, total: 0, result: 4 });
});

test("summarizes the brokerage account", () => {
  const summary = summarizeBrokerAccount(
    normalizeBrokerCash({ free: 500, ppl: 12 }, "GBP"),
    [{ ticker: "AAPL", quantity: 2, averagePrice: 100, currentPrice: 110, ppl: 20 }]
  );
  assert.equal(summary.broker, BROKER_ID);
  assert.equal(summary.currency, "GBP");
  assert.equal(summary.cash, 500);
  assert.equal(summary.holdingsValue, 220);
  assert.equal(summary.accountValue, 720);
  assert.equal(summary.returnValue, 12);
  assert.equal(summary.positions.length, 1);
  assert.equal(Object.isFrozen(summary), true);
});
