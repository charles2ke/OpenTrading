import assert from "node:assert/strict";
import test from "node:test";
import {
  STARTING_CASH,
  createPortfolio,
  executeOrder,
  getInstrument,
  isPortfolio,
  searchIndices,
  searchInstruments,
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

test("searches instruments across names, exchanges, and identifiers", () => {
  assert.deepEqual(searchInstruments("").length, 6);
  assert.deepEqual(searchInstruments("   ").length, 6);
  assert.deepEqual(searchInstruments(undefined).length, 6);
  assert.deepEqual(searchInstruments("hsbc").map((instrument) => instrument.symbol), ["HSBA"]);
  assert.deepEqual(searchInstruments("XETRA").map((instrument) => instrument.symbol), ["SAP"]);
  assert.deepEqual(searchInstruments("US88160R1014").map((instrument) => instrument.symbol), ["TSLA"]);
  assert.deepEqual(searchInstruments("594918104").map((instrument) => instrument.symbol), ["MSFT"]);
  assert.deepEqual(searchInstruments("2046251").map((instrument) => instrument.symbol), ["AAPL"]);
  assert.deepEqual(searchInstruments("apple nasdaq").map((instrument) => instrument.symbol), ["AAPL"]);
  assert.deepEqual(searchInstruments("apple lse"), []);
  assert.deepEqual(searchInstruments("zzzz"), []);
});

test("ignores punctuation and matches comma separated queries", () => {
  assert.deepEqual(searchInstruments("aapl.").map((instrument) => instrument.symbol), ["AAPL"]);
  assert.deepEqual(searchInstruments("US-8816-0R1014").map((instrument) => instrument.symbol), ["TSLA"]);
  assert.deepEqual(searchInstruments("tsla, msft").map((instrument) => instrument.symbol), ["MSFT", "TSLA"]);
  assert.deepEqual(searchInstruments("apple nasdaq, hsbc").map((instrument) => instrument.symbol), ["AAPL", "HSBA"]);
  assert.deepEqual(searchInstruments(",,").length, 6);
  assert.deepEqual(searchIndices("nikkei, dax").map((index) => index.code), ["NKY", "DAX"]);
});

test("searches indices by name and code", () => {
  assert.deepEqual(searchIndices("nikkei").map((index) => index.code), ["NKY"]);
  assert.deepEqual(searchIndices("ukx").map((index) => index.name), ["FTSE 100"]);
  assert.deepEqual(searchIndices("s&p").map((index) => index.code), ["SPX"]);
  assert.deepEqual(searchIndices("").length, 4);
  assert.deepEqual(searchIndices("zzzz"), []);
});
