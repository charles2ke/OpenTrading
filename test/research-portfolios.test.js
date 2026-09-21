import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BENCHMARK,
  createResearchPortfolio,
  holdingsForRisk,
  recordTransaction,
  summarizeResearchPortfolio
} from "../src/core/research/portfolios.js";

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

test("creates named research portfolios with defaults and validation", () => {
  assert.equal(DEFAULT_BENCHMARK, "S&P 500");
  assert.deepEqual(createResearchPortfolio({ name: "  Long Term #1  ", cash: 250, currency: "EUR" }), {
    id: "long-term-1",
    name: "Long Term #1",
    currency: "EUR",
    cash: 250,
    benchmark: "S&P 500",
    positions: {},
    transactions: []
  });
  assert.deepEqual(createResearchPortfolio({ name: "Income", benchmark: "MSCI World" }).cash, 0);
  assert.throws(() => createResearchPortfolio(), /A portfolio needs a name\./);
  assert.throws(() => createResearchPortfolio({ name: "Bad", cash: -1 }), /Cash must be zero or more\./);
  assert.throws(() => createResearchPortfolio({ name: "Bad", cash: Number.NaN }), /Cash must be zero or more\./);
});

test("validates transactions before mutating a portfolio", () => {
  const portfolio = createResearchPortfolio({ name: "Test", cash: 1_000 });
  assert.deepEqual(recordTransaction(portfolio, { symbol: "bad", quantity: 1, price: 1, side: "buy" }), {
    portfolio,
    error: "Unknown security."
  });
  assert.deepEqual(recordTransaction(portfolio, { symbol: "AAPL", quantity: 0, price: 1, side: "buy" }), {
    portfolio,
    error: "Quantity must be positive."
  });
  assert.deepEqual(recordTransaction(portfolio, { symbol: "AAPL", quantity: 1, price: 0, side: "buy" }), {
    portfolio,
    error: "Price must be positive."
  });
  assert.deepEqual(recordTransaction(portfolio, { symbol: "AAPL", quantity: 1, price: 1, side: "hold" }), {
    portfolio,
    error: "Side must be buy or sell."
  });
  assert.deepEqual(recordTransaction(portfolio, { symbol: "AAPL", quantity: 1, price: 1, side: "sell" }), {
    portfolio,
    error: "You cannot sell more than you hold."
  });
  assert.deepEqual(recordTransaction(portfolio, null), {
    portfolio,
    error: "Unknown security."
  });
});

test("records buys, partial sells, closing sells, fees, and cash movements", () => {
  const portfolio = createResearchPortfolio({ name: "Trades", cash: 10_000 });
  const first = recordTransaction(portfolio, { symbol: "aapl", quantity: "2", price: "200", fees: 5, side: "buy" });
  assert.equal(first.error, "");
  assert.deepEqual(first.portfolio.positions.AAPL, { quantity: 2, costBasis: 405 });
  assert.equal(first.portfolio.cash, 9_595);
  assert.deepEqual(first.portfolio.transactions[0], { symbol: "AAPL", quantity: 2, price: 200, fees: 5, side: "buy" });

  const second = recordTransaction(first.portfolio, { symbol: "AAPL", quantity: 1, price: 300, fees: Number.NaN, side: "buy" });
  assert.deepEqual(second.portfolio.positions.AAPL, { quantity: 3, costBasis: 705 });
  assert.equal(second.portfolio.cash, 9_295);

  const partial = recordTransaction(second.portfolio, { symbol: "AAPL", quantity: 1, price: 250, fees: 2, side: "sell" });
  assert.deepEqual(partial.portfolio.positions.AAPL, { quantity: 2, costBasis: 470 });
  assert.equal(partial.portfolio.cash, 9_543);

  const closed = recordTransaction(partial.portfolio, { symbol: "AAPL", quantity: 2, price: 250, fees: 1, side: "sell" });
  assert.deepEqual(closed.portfolio.positions, {});
  assert.equal(closed.portfolio.cash, 10_042);
});

test("summarizes empty and invested research portfolios", () => {
  const empty = createResearchPortfolio({ name: "Empty", cash: 100 });
  assert.deepEqual(summarizeResearchPortfolio(empty), {
    name: "Empty",
    benchmark: "S&P 500",
    cash: 100,
    positions: [],
    holdingsValue: 0,
    totalValue: 100,
    unrealizedGain: 0,
    unrealizedGainPercent: 0,
    weights: []
  });

  const portfolio = {
    name: "Invested",
    benchmark: "Custom",
    cash: 50,
    positions: {
      AAPL: { quantity: 2, costBasis: 400 },
      MSFT: { quantity: 1, costBasis: 500 }
    },
    transactions: []
  };
  const summary = summarizeResearchPortfolio(portfolio);
  assert.equal(summary.positions[0].symbol, "AAPL");
  assert.equal(summary.positions[1].symbol, "MSFT");
  closeTo(summary.holdingsValue, 883.07);
  closeTo(summary.totalValue, 933.07);
  closeTo(summary.unrealizedGain, -16.92999999999995);
  closeTo(summary.unrealizedGainPercent, (883.07 / 900 - 1) * 100);
  closeTo(summary.positions[0].averageCost, 200);
  closeTo(summary.positions[0].unrealizedGain, 64.28);
  closeTo(summary.weights[0].weightPercent, 464.28 / 883.07 * 100);

  const zeroValue = summarizeResearchPortfolio({
    name: "Zero",
    benchmark: "Custom",
    cash: 0,
    positions: { AAPL: { quantity: 0, costBasis: 10 } },
    transactions: []
  });
  assert.equal(zeroValue.holdingsValue, 0);
  assert.equal(zeroValue.weights[0].weightPercent, 0);
  assert.equal(zeroValue.unrealizedGainPercent, -100);
});

test("maps holdings into risk-engine input", () => {
  assert.deepEqual(holdingsForRisk({ positions: { AAPL: { quantity: 2 }, MSFT: { quantity: 1 } } }), [
    { symbol: "AAPL", quantity: 2 },
    { symbol: "MSFT", quantity: 1 }
  ]);
});
