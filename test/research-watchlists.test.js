import assert from "node:assert/strict";
import test from "node:test";
import {
  ALERT_TYPES,
  addToWatchlist,
  createAlert,
  createWatchlist,
  evaluateAlerts,
  removeFromWatchlist,
  watchlistView
} from "../src/core/research/watchlists.js";

test("creates named watchlists and rejects empty names", () => {
  assert.deepEqual(createWatchlist(" Income ideas "), { id: "income-ideas", name: "Income ideas", symbols: [] });
  assert.throws(() => createWatchlist("  "), /A watchlist needs a name/);
  assert.throws(() => createWatchlist(), /A watchlist needs a name/);
});

test("adds and removes only known securities", () => {
  let watchlist = createWatchlist("Core");
  watchlist = addToWatchlist(watchlist, "aapl");
  watchlist = addToWatchlist(watchlist, "AAPL");
  watchlist = addToWatchlist(watchlist, "NOPE");
  assert.deepEqual(watchlist.symbols, ["AAPL"]);
  watchlist = addToWatchlist(watchlist, "JNJ");
  assert.deepEqual(removeFromWatchlist(watchlist, " jnj ").symbols, ["AAPL"]);
  assert.deepEqual(removeFromWatchlist(watchlist, null).symbols, ["AAPL", "JNJ"]);
});

test("renders price, valuation, income and earnings columns", () => {
  const rows = watchlistView({ symbols: ["AAPL", "TSLA"] });
  assert.equal(rows[0].name, "Apple");
  assert.equal(rows[0].price, 232.14);
  assert.equal(rows[0].changePercent, ((232.14 - 228.76) / 228.76) * 100);
  assert.equal(rows[0].forwardPe, 29.4);
  assert.equal(rows[0].dividendYieldPercent, 0.45);
  assert.equal(rows[0].nextEarnings, "2026-01-29");
  assert.equal(rows[1].nextEarnings, null);
});

test("creates validated alerts", () => {
  assert.deepEqual(ALERT_TYPES, ["price", "earnings", "valuation", "dividend", "technical", "concentration", "macro"]);
  assert.deepEqual(createAlert({ type: "price", symbol: "aapl", threshold: 250 }), {
    id: "price:AAPL:250",
    type: "price",
    symbol: "AAPL",
    threshold: 250,
    direction: "above",
    createdAt: null
  });
  assert.equal(createAlert({ type: "concentration", threshold: 25 }).id, "concentration:portfolio:25");
  assert.equal(createAlert({ type: "macro" }).id, "macro:portfolio:event");
  assert.throws(() => createAlert({ type: "rumour" }), /Unsupported alert type/);
  assert.throws(() => createAlert({ type: "price", symbol: "NOPE" }), /Unknown security/);
});

test("evaluates each alert type against calculated context", () => {
  const alerts = [
    createAlert({ type: "price", symbol: "AAPL", threshold: 200 }),
    createAlert({ type: "price", symbol: "AAPL", threshold: 200, direction: "below" }),
    createAlert({ type: "valuation", symbol: "AAPL", threshold: 20 }),
    createAlert({ type: "dividend", symbol: "JPM" }),
    createAlert({ type: "dividend", symbol: "AAPL" }),
    createAlert({ type: "earnings", symbol: "AAPL" }),
    createAlert({ type: "earnings", symbol: "TSLA" }),
    createAlert({ type: "technical", symbol: "AAPL" }),
    createAlert({ type: "concentration", threshold: 25 }),
    createAlert({ type: "macro" })
  ];
  const evaluated = evaluateAlerts(alerts, {
    horizonDate: "2026-03-31",
    technicalSignals: [{ direction: "bullish" }],
    largestPositionPercent: 31,
    macroReleases: [{ date: "2026-01-13" }]
  });
  assert.deepEqual(evaluated.map((alert) => alert.triggered), [true, false, false, true, false, true, false, true, true, true]);
  assert.deepEqual(evaluated[0].evaluatedWith, { type: "price", symbol: "AAPL", threshold: 200 });

  const quiet = evaluateAlerts([
    createAlert({ type: "earnings", symbol: "AAPL" }),
    createAlert({ type: "technical", symbol: "AAPL" }),
    createAlert({ type: "concentration", threshold: 25 }),
    createAlert({ type: "macro" })
  ]);
  assert.deepEqual(quiet.map((alert) => alert.triggered), [true, false, false, false]);
  assert.deepEqual(evaluateAlerts(), []);
});
