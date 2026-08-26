import assert from "node:assert/strict";
import test from "node:test";
import {
  STARTING_CASH,
  createPortfolio,
  executeOrder,
  getInstrument,
  isPortfolio,
  summarizePortfolio,
  validateOrder
} from "../src/core/trading.js";

test("creates an empty funded portfolio", () => {
  assert.deepEqual(createPortfolio(), { cash: STARTING_CASH, positions: {} });
  assert.equal(getInstrument("AAPL").name, "Apple");
  assert.equal(getInstrument("UNKNOWN"), undefined);
});

test("validates every order constraint", () => {
  const empty = createPortfolio();
  assert.equal(validateOrder(empty, { symbol: "UNKNOWN", side: "buy", quantity: 1 }), "Select a supported stock.");
  assert.equal(validateOrder(empty, { symbol: "AAPL", side: "buy", quantity: 0 }), "Shares must be a whole number between 1 and 10,000.");
  assert.equal(validateOrder(empty, { symbol: "AAPL", side: "buy", quantity: 10_001 }), "Shares must be a whole number between 1 and 10,000.");
  assert.equal(validateOrder(empty, { symbol: "AAPL", side: "buy", quantity: 1.5 }), "Shares must be a whole number between 1 and 10,000.");
  assert.equal(validateOrder(empty, { symbol: "AAPL", side: "hold", quantity: 1 }), "Choose buy or sell.");
  assert.equal(validateOrder(empty, { symbol: "AAPL", side: "buy", quantity: 10_000 }), "This order exceeds your available cash.");
  assert.equal(validateOrder(empty, { symbol: "AAPL", side: "sell", quantity: 1 }), "You cannot sell more shares than you own.");
  assert.equal(validateOrder(empty, { symbol: "AAPL", side: "buy", quantity: "2" }), "");
});

test("buys, adds to, partially sells, and closes a position", () => {
  const first = executeOrder(createPortfolio(), { symbol: "AAPL", side: "buy", quantity: 2 });
  assert.equal(first.error, "");
  assert.equal(first.portfolio.positions.AAPL.quantity, 2);
  assert.equal(first.portfolio.cash, STARTING_CASH - 464.28);

  const second = executeOrder(first.portfolio, { symbol: "AAPL", side: "buy", quantity: 1 });
  assert.equal(second.portfolio.positions.AAPL.quantity, 3);
  assert.equal(second.portfolio.positions.AAPL.averagePrice, 232.14);

  const partial = executeOrder(second.portfolio, { symbol: "AAPL", side: "sell", quantity: 1 });
  assert.deepEqual(partial.portfolio.positions.AAPL, { quantity: 2, averagePrice: 232.14 });

  const closed = executeOrder(partial.portfolio, { symbol: "AAPL", side: "sell", quantity: 2 });
  assert.deepEqual(closed.portfolio.positions, {});
  assert.equal(closed.portfolio.cash, STARTING_CASH);
});

test("does not change the portfolio after an invalid order", () => {
  const portfolio = createPortfolio();
  assert.deepEqual(
    executeOrder(portfolio, { symbol: "AAPL", side: "sell", quantity: 1 }),
    { portfolio, error: "You cannot sell more shares than you own." }
  );
});

test("summarizes empty, profitable, and losing positions", () => {
  assert.deepEqual(summarizePortfolio(createPortfolio()), {
    cash: STARTING_CASH,
    positions: [],
    portfolioValue: STARTING_CASH,
    dailyChange: 0
  });
  const portfolio = {
    cash: 50_000,
    positions: {
      AAPL: { quantity: 2, averagePrice: 200 },
      MSFT: { quantity: 1, averagePrice: 450 }
    }
  };
  const summary = summarizePortfolio(portfolio);
  assert.ok(Math.abs(summary.positions[0].returnValue - 64.28) < Number.EPSILON * 256);
  assert.ok(Math.abs(summary.positions[1].returnValue + 31.21) < Number.EPSILON * 256);
  assert.ok(Math.abs(summary.portfolioValue - 50_883.07) < Number.EPSILON * 256);
  assert.ok(summary.dailyChange > 0);
});

test("recognizes only structurally valid portfolios", () => {
  const valid = { cash: 1, positions: { AAPL: { quantity: 1, averagePrice: 100 } } };
  assert.equal(isPortfolio(valid), true);
  assert.equal(isPortfolio(null), false);
  assert.equal(isPortfolio("portfolio"), false);
  assert.equal(isPortfolio({ cash: "1", positions: {} }), false);
  assert.equal(isPortfolio({ cash: -1, positions: {} }), false);
  assert.equal(isPortfolio({ cash: 1 }), false);
  assert.equal(isPortfolio({ cash: 1, positions: [] }), false);
  assert.equal(isPortfolio({ cash: 1, positions: { BAD: { quantity: 1, averagePrice: 1 } } }), false);
  assert.equal(isPortfolio({ cash: 1, positions: { AAPL: null } }), false);
  assert.equal(isPortfolio({ cash: 1, positions: { AAPL: { quantity: 1.2, averagePrice: 1 } } }), false);
  assert.equal(isPortfolio({ cash: 1, positions: { AAPL: { quantity: 0, averagePrice: 1 } } }), false);
  assert.equal(isPortfolio({ cash: 1, positions: { AAPL: { quantity: 1, averagePrice: "1" } } }), false);
  assert.equal(isPortfolio({ cash: 1, positions: { AAPL: { quantity: 1, averagePrice: 0 } } }), false);
});
