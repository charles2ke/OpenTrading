import assert from "node:assert/strict";
import test from "node:test";
import { DATA_AS_OF, DATA_PROVIDER, DATA_SOURCE, dividends, earnings, fundamentals, macroCalendar, macroReleases, macroSeries, marketShare, metricRecord, priceHistory, priceRecord, securities, securityBySymbol } from "../src/core/research/dataset.js";

test("exports reference datasets and finds securities by normalized symbol", () => {
  assert.equal(DATA_PROVIDER, "OpenTrading reference dataset");
  assert.equal(DATA_SOURCE, "simulated-market-data");
  assert.equal(DATA_AS_OF, "2026-01-05T21:00:00.000Z");
  assert.equal(securities.length, 10);
  assert.equal(Object.isFrozen(securities), true);
  assert.equal(fundamentals.AAPL.pe, 32.6);
  assert.equal(dividends.JNJ.consecutiveGrowthYears, 62);
  assert.equal(earnings.NVDA.quarters.length, 4);
  assert.equal(marketShare.MSFT.at(-1).share, 25.6);
  assert.equal(macroSeries.policyRate.observations.at(-1)[1], 3.75);
  assert.equal(macroCalendar[0].event, "CPI report");
  assert.equal(macroReleases.at(-1).event, "Central bank rate decision");

  assert.equal(securityBySymbol(" aapl ").name, "Apple");
  assert.equal(securityBySymbol(7203).name, "Toyota Motor");
  assert.equal(securityBySymbol(null), null);
  assert.equal(securityBySymbol("missing"), null);
});

test("creates deterministic trading-day price history and rejects invalid requests", () => {
  assert.deepEqual(priceHistory("unknown"), []);
  assert.deepEqual(priceHistory("AAPL", { bars: 1 }), []);
  assert.deepEqual(priceHistory("AAPL", { bars: 2.5 }), []);

  const history = priceHistory("AAPL", { bars: 6, endDate: "2026-01-05T21:00:00.000Z" });
  assert.equal(history.length, 6);
  assert.deepEqual(history.map((bar) => bar.date), ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-05"]);
  assert.deepEqual(history.at(-1), {
    date: "2026-01-05",
    open: 230.477,
    high: 237.129,
    low: 227.151,
    close: 232.14,
    volume: 4774968
  });
  assert.equal(priceHistory("AAPL", { bars: 6, endDate: "2026-01-05T21:00:00.000Z" }).at(-1).close, 232.14);

  const originalVolatility = fundamentals.AAPL.volatility;
  const originalMomentum = fundamentals.AAPL.momentum12m;
  fundamentals.AAPL.volatility = undefined;
  fundamentals.AAPL.momentum12m = undefined;
  const fallbackHistory = priceHistory("AAPL", { bars: 3, endDate: "2026-01-05T21:00:00.000Z" });
  assert.equal(fallbackHistory.length, 3);
  assert.equal(fallbackHistory.at(-1).close, 232.14);
  fundamentals.AAPL.volatility = originalVolatility;
  fundamentals.AAPL.momentum12m = originalMomentum;

  const originalSymbol = securities[0].symbol;
  const zeroSeedSymbol = String.fromCharCode(8, 0, 29, 29, 5, 3);
  securities[0].symbol = zeroSeedSymbol;
  try {
    const zeroSeedHistory = priceHistory(zeroSeedSymbol, { bars: 2, endDate: "2026-01-05T21:00:00.000Z" });
    assert.equal(zeroSeedHistory.length, 2);
    assert.equal(zeroSeedHistory.at(-1).close, 232.14);
  } finally {
    securities[0].symbol = originalSymbol;
  }
});

test("wraps metrics and prices in provenance records", () => {
  assert.deepEqual(metricRecord("MSFT", "pe"), {
    value: 31.6,
    available: true,
    reason: "",
    field: "pe",
    provider: DATA_PROVIDER,
    source: DATA_SOURCE,
    asOf: DATA_AS_OF,
    retrievedAt: DATA_AS_OF,
    currency: "USD"
  });

  assert.deepEqual(metricRecord("SAP", "grossMargin").currency, "EUR");
  assert.deepEqual(metricRecord("JPM", "roic"), {
    value: null,
    available: false,
    reason: "not reported by the data provider",
    field: "roic",
    provider: DATA_PROVIDER,
    source: DATA_SOURCE,
    asOf: null,
    retrievedAt: null,
    currency: ""
  });
  assert.equal(metricRecord("unknown", "pe").available, false);
  assert.equal(metricRecord("AAPL", "doesNotExist").reason, "not reported by the data provider");

  const originalPe = fundamentals.AAPL.pe;
  fundamentals.AAPL.pe = Number.POSITIVE_INFINITY;
  assert.equal(metricRecord("AAPL", "pe").available, false);
  fundamentals.AAPL.pe = originalPe;

  assert.deepEqual(priceRecord("hsba"), {
    value: 13.76,
    available: true,
    reason: "",
    field: "price",
    provider: DATA_PROVIDER,
    source: DATA_SOURCE,
    asOf: DATA_AS_OF,
    retrievedAt: DATA_AS_OF,
    currency: "GBP"
  });
  assert.deepEqual(priceRecord("nope"), {
    value: null,
    available: false,
    reason: "unknown security",
    field: "price",
    provider: DATA_PROVIDER,
    source: DATA_SOURCE,
    asOf: null,
    retrievedAt: null,
    currency: ""
  });
});
