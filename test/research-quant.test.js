import assert from "node:assert/strict";
import test from "node:test";
import { analyzeQuantPatterns, eventStudy, returnDistribution, seasonality } from "../src/core/research/quant.js";
import { earnings } from "../src/core/research/dataset.js";

const approx = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} !== ${expected}`);

const bars = [
  { date: "2026-01-01", close: 100 },
  { date: "2026-01-02", close: 101 },
  { date: "2026-01-05", close: 99 },
  { date: "2026-02-02", close: 102 },
  { date: "2026-02-03", close: 103 }
];

test("summarizes seasonal monthly and weekday returns", () => {
  const result = seasonality(bars);
  assert.deepEqual(result.monthly.map((row) => row.period), ["January", "February"]);
  approx(result.monthly[0].meanPercent, -1);
  approx(result.monthly[1].meanPercent, 4.040404040404044);
  assert.equal(result.monthly[0].observations, 1);
  assert.equal(result.monthly[0].note, "Sample too small to be meaningful.");
  assert.deepEqual(result.dayOfWeek.map((row) => row.period), ["Monday", "Tuesday", "Friday"]);
});

test("buckets return distributions with open-ended tails", () => {
  assert.deepEqual(returnDistribution([-0.06, -0.04, -0.02, -0.005, 0, 0.02, 0.04, 0.06]), [
    { from: null, to: -3, count: 2 },
    { from: -3, to: -1, count: 1 },
    { from: -1, to: 0, count: 1 },
    { from: 0, to: 1, count: 1 },
    { from: 1, to: 3, count: 1 },
    { from: 3, to: 5, count: 1 },
    { from: 5, to: null, count: 1 }
  ]);
});

test("performs event studies for missing, small and larger samples", () => {
  assert.deepEqual(eventStudy(bars, ["2025-12-01"], { before: 2, after: 2 }), {
    observations: 0,
    average: [],
    note: "No event windows with sufficient surrounding price history."
  });

  const small = eventStudy(bars, ["2026-01-05"], { before: 1, after: 1 });
  assert.equal(small.observations, 1);
  assert.equal(small.average[0].averageCumulativePercent, 0);
  approx(small.average[1].averageCumulativePercent, -1.980198019801982);
  approx(small.average[2].averageCumulativePercent, 0.990099009900991);
  assert.equal(small.note, "Small sample: treat the averages as indicative only.");

  const nextAvailable = eventStudy(bars, ["2026-01-04"], { before: 1, after: 1 });
  assert.equal(nextAvailable.observations, 1);
  assert.equal(nextAvailable.average[1].offset, 0);

  const longBars = Array.from({ length: 14 }, (_, index) => ({ date: `2026-01-${String(index + 1).padStart(2, "0")}`, close: 100 + index }));
  const many = eventStudy(longBars, longBars.slice(1, 11).map((bar) => bar.date), { before: 1, after: 1 });
  assert.equal(many.observations, 10);
  assert.equal(many.note, "");
  approx(many.average[2].averageCumulativePercent, 1.9153234302689626);

  const tooLate = eventStudy(bars, ["2026-02-03"], { before: 1, after: 1 });
  assert.equal(tooLate.observations, 0);
});

test("analyzes quantitative patterns and unavailable alternative data", () => {
  assert.deepEqual(analyzeQuantPatterns("UNKNOWN", { bars: 80 }), { valid: false, errors: ["Not enough price history for quantitative analysis."] });
  assert.deepEqual(analyzeQuantPatterns("AAPL", { bars: 10 }), { valid: false, errors: ["Not enough price history for quantitative analysis."] });

  const analysis = analyzeQuantPatterns("SAP", { bars: 120, benchmarkSymbol: "MSFT" });
  assert.equal(analysis.valid, true);
  assert.equal(analysis.symbol, "SAP");
  assert.equal(analysis.observations, 119);
  assert.equal(analysis.distribution.reduce((total, bucket) => total + bucket.count, 0), 119);
  assert.equal(analysis.seasonality.monthly.length > 0, true);
  assert.equal(analysis.events.earnings.note, "No dated earnings events available.");
  assert.equal(analysis.alternativeData.shortInterest.available, false);
  assert.equal(analysis.alternativeData.optionsActivity.reason, "no options dataset connected");
  assert.equal(analysis.caveat, "Sample size and statistical significance are shown so historical noise is not mistaken for an edge.");

  earnings.AAPL.quarters.push({ period: "Undated", reportDate: "" });
  const apple = analyzeQuantPatterns("AAPL", { bars: 120, benchmarkSymbol: "MSFT" });
  earnings.AAPL.quarters.pop();
  assert.equal(apple.events.earnings.observations, 2);
  assert.equal(apple.events.earnings.note, "Small sample: treat the averages as indicative only.");
});

test("reports larger seasonal samples without small-sample notes", () => {
  const result = seasonality(Array.from({ length: 100 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    close: 100 + index
  })));
  assert.equal(result.dayOfWeek[0].observations >= 12, true);
  assert.equal(result.dayOfWeek[0].note, "");
  assert.equal(result.dayOfWeek[0].significant, true);

  const choppy = seasonality(Array.from({ length: 100 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    close: 100 + (index % 2)
  })));
  assert.equal(choppy.dayOfWeek[0].note, "");
  assert.equal(choppy.dayOfWeek[0].significant, false);

  const twoJanuarys = seasonality([
    { date: "2026-01-01", close: 100 },
    { date: "2026-01-02", close: 110 },
    { date: "2027-01-01", close: 120 },
    { date: "2027-01-02", close: 132 }
  ]);
  assert.equal(twoJanuarys.monthly[0].observations, 2);
});

test("uses zero defaults for empty statistical groups", () => {
  const entries = Map.prototype.entries;
  Map.prototype.entries = function patchedEntries() {
    const rows = [...entries.call(this)];
    return (rows.every(([, value]) => Array.isArray(value)) ? [...rows, [99, []]] : rows)[Symbol.iterator]();
  };
  try {
    const result = seasonality(bars);
    const emptyMonth = result.monthly.find((row) => row.observations === 0);
    assert.equal(emptyMonth.meanPercent, 0);
    assert.equal(emptyMonth.medianPercent, 0);
    assert.equal(emptyMonth.winRatePercent, 0);
  } finally {
    Map.prototype.entries = entries;
  }
});
