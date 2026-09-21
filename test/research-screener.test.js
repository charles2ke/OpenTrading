import assert from "node:assert/strict";
import test from "node:test";
import { SCREENER_FIELDS, applyFilters, compareSecurities, screen, sortRows, toCsv, universe } from "../src/core/research/screener.js";

test("builds a screener universe with metadata and fundamentals", () => {
  const rows = universe();
  assert.equal(rows.length, 10);
  assert.equal(rows[0].symbol, "AAPL");
  assert.equal(rows[0].marketCap, 3_510_000);
  assert.equal(rows[0].pe, 32.6);
  assert.notEqual(rows[0], universe()[0]);
  assert.equal(SCREENER_FIELDS[0].label, "Market cap");
});

test("filters rows by lists and numeric ranges", () => {
  const rows = universe();
  assert.equal(applyFilters(rows).length, 10);
  assert.equal(applyFilters(rows, { sectors: [], industries: [], regions: [] }).length, 10);
  assert.deepEqual(applyFilters(rows, { sectors: ["Technology"], regions: ["Europe"] }).map((row) => row.symbol), ["SAP"]);
  assert.deepEqual(applyFilters(rows, { industries: ["Software"], marketCap: { min: 1_000_000 } }).map((row) => row.symbol), ["MSFT"]);
  assert.deepEqual(applyFilters(rows, { sectors: ["Technology"], pe: { max: 35 } }).map((row) => row.symbol), ["AAPL", "MSFT"]);
  assert.deepEqual(applyFilters(rows, { roic: { min: 1 } }).map((row) => row.symbol), ["AAPL", "MSFT", "NVDA", "TSLA", "XOM", "JNJ", "SAP", "7203"]);
  assert.deepEqual(applyFilters(rows, { marketCap: { min: 1_000_000, max: 3_400_000 } }).map((row) => row.symbol), ["MSFT", "NVDA", "TSLA"]);
  assert.deepEqual(applyFilters([{ symbol: "BAD", sector: "Technology", score: Number.NaN }], { score: { min: 0 } }), []);
});

test("sorts rows in both directions with missing values and symbol ties", () => {
  const rows = [
    { symbol: "BBB", score: null },
    { symbol: "AAA", score: null },
    { symbol: "DDD", score: 2 },
    { symbol: "CCC", score: 2 },
    { symbol: "EEE", score: 5 },
    { symbol: "FFF", score: Number.NaN }
  ];
  assert.deepEqual(sortRows(rows, "score").map((row) => row.symbol), ["EEE", "CCC", "DDD", "AAA", "BBB", "FFF"]);
  assert.deepEqual(sortRows(rows, "score", "asc").map((row) => row.symbol), ["CCC", "DDD", "EEE", "AAA", "BBB", "FFF"]);
  assert.deepEqual(rows.map((row) => row.symbol), ["BBB", "AAA", "DDD", "CCC", "EEE", "FFF"]);
});

test("screens the universe with defaults, sorting, filtering, and limits", () => {
  assert.deepEqual(screen().rows.slice(0, 3).map((row) => row.symbol), ["AAPL", "NVDA", "MSFT"]);

  const limited = screen({ filters: { sectors: ["Technology"] }, sort: { field: "pe", direction: "asc" }, limit: 2 });
  assert.deepEqual(limited.rows.map((row) => row.symbol), ["MSFT", "AAPL"]);
  assert.equal(limited.matched, 4);
  assert.equal(limited.universeSize, 10);
  assert.deepEqual(limited.filters, { sectors: ["Technology"] });
  assert.deepEqual(limited.sort, { field: "pe", direction: "asc" });

  assert.equal(screen({ limit: 0 }).rows.length, 10);
});

test("compares selected securities across default and custom fields", () => {
  const defaults = compareSecurities(["aapl", "UNKNOWN", "MSFT"]);
  assert.equal(defaults.length, SCREENER_FIELDS.length);
  assert.deepEqual(defaults[0], {
    field: "marketCap",
    label: "Market cap",
    values: [
      { symbol: "AAPL", value: 3_510_000 },
      { symbol: "MSFT", value: 3_110_000 }
    ]
  });

  assert.deepEqual(compareSecurities(["JPM", null], ["roic", "custom"]), [
    { field: "roic", label: "ROIC", values: [{ symbol: "JPM", value: null }] },
    { field: "custom", label: "custom", values: [{ symbol: "JPM", value: null }] }
  ]);
  assert.deepEqual(compareSecurities(undefined, ["pe"]), [{ field: "pe", label: "P/E", values: [] }]);
});

test("exports rows to CSV with escaping and default columns", () => {
  assert.equal(toCsv([{ symbol: "AAPL", name: "Apple", sector: "Technology", marketCap: 1, pe: 2, revenueGrowth: 3, roic: 4, dividendYield: 5 }]), "symbol,name,sector,marketCap,pe,revenueGrowth,roic,dividendYield\nAAPL,Apple,Technology,1,2,3,4,5");
  assert.equal(toCsv([
    { symbol: "AAPL", name: "Apple, Inc.", note: "said \"hello\"", missing: null },
    { symbol: "MSFT", name: "Microsoft", note: "line\nbreak", missing: undefined }
  ], ["symbol", "name", "note", "missing"]), "symbol,name,note,missing\nAAPL,\"Apple, Inc.\",\"said \"\"hello\"\"\",\nMSFT,Microsoft,\"line\nbreak\",");
});
