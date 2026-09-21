import assert from "node:assert/strict";
import test from "node:test";
import {
  CALCULATION_VERSION,
  createReport,
  listReports,
  reportToCsv,
  reportToPrintable
} from "../src/core/research/reports.js";
import { DATA_AS_OF } from "../src/core/research/dataset.js";

function sample(overrides = {}) {
  return createReport({
    title: " DCF note ",
    module: "valuation",
    symbol: "AAPL",
    assumptions: { wacc: 8.5, nested: { terminalGrowth: 2.5 } },
    results: { valuePerShare: 210.5, note: 'contains "quotes", commas' },
    narrative: ["Line one"],
    modelVersion: "research-orchestrator-1",
    ...overrides
  });
}

test("captures an immutable snapshot of assumptions, results and provenance", () => {
  const report = sample();
  assert.equal(report.id, `valuation:AAPL:${DATA_AS_OF}`);
  assert.equal(report.title, "DCF note");
  assert.equal(report.calculationVersion, CALCULATION_VERSION);
  assert.equal(report.dataSnapshot.asOf, DATA_AS_OF);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.assumptions.nested));
  assert.throws(() => {
    report.assumptions.wacc = 12;
  }, TypeError);
});

test("clones inputs so later edits do not rewrite history", () => {
  const assumptions = { wacc: 8.5 };
  const report = createReport({ title: "Snapshot", module: "valuation", assumptions });
  assumptions.wacc = 12;
  assert.equal(report.assumptions.wacc, 8.5);
  assert.equal(report.symbol, null);
  assert.equal(report.modelVersion, null);
  assert.deepEqual(report.narrative, []);
  assert.equal(report.id, `valuation:portfolio:${DATA_AS_OF}`);
});

test("requires a title and a module", () => {
  assert.throws(() => createReport(), /A report needs a title/);
  assert.throws(() => createReport({ title: "  ", module: "valuation" }), /A report needs a title/);
  assert.throws(() => createReport({ title: "No module" }), /A report needs a module/);
});

test("lists reports newest first with optional filters", () => {
  const reports = [
    sample({ createdAt: "2026-01-01T00:00:00.000Z" }),
    sample({ createdAt: "2026-01-03T00:00:00.000Z", module: "risk", symbol: null }),
    sample({ createdAt: "2026-01-02T00:00:00.000Z" })
  ];
  assert.deepEqual(listReports(reports).map((report) => report.createdAt), [
    "2026-01-03T00:00:00.000Z",
    "2026-01-02T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  ]);
  assert.equal(listReports(reports, { module: "risk" }).length, 1);
  assert.equal(listReports(reports, { symbol: "AAPL" }).length, 2);
  assert.deepEqual(listReports(), []);
});

test("exports a flattened, escaped CSV", () => {
  const lines = reportToCsv(sample()).split("\n");
  assert.equal(lines[0], "field,value");
  assert.ok(lines.includes("assumptions.wacc,8.5"));
  assert.ok(lines.includes("assumptions.nested.terminalGrowth,2.5"));
  assert.ok(lines.includes('results.note,"contains ""quotes"", commas"'));
  assert.ok(lines.some((line) => line === "dataSource,OpenTrading reference dataset / simulated-market-data @ 2026-01-05T21:00:00.000Z"));
  assert.ok(reportToCsv(createReport({ title: "Empty", module: "risk" })).includes("symbol,"));
});

test("renders a printable summary including the model used", () => {
  const printable = reportToPrintable(sample()).split("\n");
  assert.equal(printable[0], "# DCF note");
  assert.equal(printable[2], "Security: AAPL");
  assert.equal(printable[6], "Model: research-orchestrator-1");
  assert.equal(printable.at(-1), "Line one");
  const deterministic = reportToPrintable(createReport({ title: "Risk", module: "risk" })).split("\n");
  assert.equal(deterministic[2], "Security: Portfolio");
  assert.equal(deterministic[6], "Model: none (deterministic calculations only)");
});

test("freezes shared references once and escapes multi-line cells", () => {
  const shared = { unit: "USD" };
  const report = createReport({
    title: "Edge cases",
    module: "valuation",
    results: { left: shared, right: shared, empty: null, note: "line one\nline two" }
  });
  assert.ok(Object.isFrozen(report.results.left));
  assert.equal(report.results.left, report.results.right);
  const lines = reportToCsv(report).split("\n");
  assert.ok(lines.includes("results.empty,"));
  assert.ok(lines.includes('results.note,"line one'));
});
