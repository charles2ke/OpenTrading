import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPANY_TABS,
  DASHBOARD_WIDGETS,
  MODULES,
  canonicalSecurity,
  companyHeader,
  dashboard,
  defaultDcfAssumptions,
  searchSecurities
} from "../src/core/research/workspace.js";
import { DATA_AS_OF } from "../src/core/research/dataset.js";

test("exposes the application shell modules, tabs and widgets", () => {
  assert.deepEqual(MODULES.map((module) => module.id), [
    "dashboard", "discover", "company", "portfolio", "macro", "watchlists", "reports", "settings"
  ]);
  assert.equal(COMPANY_TABS.length, 9);
  assert.ok(COMPANY_TABS.includes("Valuation"));
  assert.ok(DASHBOARD_WIDGETS.includes("upcoming-earnings"));
});

test("searches by company, ticker, exchange, sector and industry", () => {
  assert.deepEqual(searchSecurities("apple").map((security) => security.symbol), ["AAPL"]);
  assert.deepEqual(searchSecurities(" nvda ").map((security) => security.symbol), ["NVDA"]);
  assert.deepEqual(searchSecurities("XETRA").map((security) => security.symbol), ["SAP"]);
  assert.deepEqual(searchSecurities("Diversified Banks").map((security) => security.symbol), ["JPM", "HSBA"]);
  assert.equal(searchSecurities("").length, 10);
  assert.equal(searchSecurities(null).length, 10);
  assert.equal(searchSecurities("does-not-exist").length, 0);
});

test("resolves a canonical security record", () => {
  assert.deepEqual(canonicalSecurity("aapl"), {
    symbol: "AAPL",
    name: "Apple",
    exchange: "NASDAQ",
    currency: "USD",
    country: "US",
    region: "North America",
    sector: "Technology",
    industry: "Consumer Electronics"
  });
  assert.equal(canonicalSecurity("NOPE"), null);
});

test("builds a company header with market data and provenance", () => {
  const header = companyHeader("MSFT");
  assert.equal(header.symbol, "MSFT");
  assert.equal(header.price, 418.79);
  assert.equal(header.changePercent, ((418.79 - 420.43) / 420.43) * 100);
  assert.deepEqual(header.tabs, [...COMPANY_TABS]);
  assert.equal(header.dataFreshness.label, "live");
  assert.equal(header.provenance.asOf, DATA_AS_OF);
  assert.equal(companyHeader("MSFT", Date.parse(DATA_AS_OF) + 3 * 86_400_000).dataFreshness.label, "stale");
  assert.equal(companyHeader("NOPE"), null);
});

test("seeds DCF assumptions from reported fundamentals", () => {
  const assumptions = defaultDcfAssumptions("aapl");
  assert.equal(assumptions.revenue, 402_100);
  assert.equal(assumptions.revenueGrowth, 6.4);
  assert.equal(assumptions.operatingMargin, 31.9);
  assert.equal(assumptions.netDebt, 47_000);
  assert.equal(assumptions.dilutedShares, 15_120);
  assert.equal(assumptions.currentPrice, 232.14);
  assert.equal(defaultDcfAssumptions("NOPE"), null);
});

test("assembles dashboard widgets from the supplied context", () => {
  const view = dashboard();
  assert.deepEqual(view.widgets, [...DASHBOARD_WIDGETS]);
  assert.equal(view.portfolio, null);
  assert.equal(view.marketOverview.length, 5);
  assert.equal(view.marketOverview[0].symbol, "AAPL");
  assert.ok(view.shortcuts.includes("dcf"));

  const populated = dashboard({
    portfolioSummary: { totalValue: 1000 },
    watchlist: ["AAPL"],
    recentReports: Array.from({ length: 7 }, (_, index) => ({ id: index })),
    savedScreens: [{ name: "Quality compounders" }]
  });
  assert.deepEqual(populated.portfolio, { totalValue: 1000 });
  assert.deepEqual(populated.watchlist, ["AAPL"]);
  assert.equal(populated.recentReports.length, 5);
  assert.equal(populated.savedScreens[0].name, "Quality compounders");
});
