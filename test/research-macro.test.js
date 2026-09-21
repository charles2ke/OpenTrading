import assert from "node:assert/strict";
import test from "node:test";
import {
  MACRO_SCENARIOS,
  SECTOR_FACTOR_SENSITIVITY,
  exposureMap,
  macroAnalysis,
  macroDashboard,
  scenarioImpact
} from "../src/core/research/macro.js";
import { macroSeries, securityBySymbol } from "../src/core/research/dataset.js";

const approx = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} !== ${expected}`);

test("builds a macro dashboard from reference observations", () => {
  const dashboard = macroDashboard();
  assert.equal(dashboard.asOf, "2026-01-01");
  assert.equal(dashboard.series.length, 14);
  assert.deepEqual(dashboard.series[0], {
    id: "policyRate",
    label: "Policy rate",
    unit: "%",
    latest: 3.75,
    changeOnePeriod: -0.25,
    changeThreePeriods: -0.75,
    history: [
      { date: "2025-07-01", value: 4.5 },
      { date: "2025-09-01", value: 4.25 },
      { date: "2025-11-01", value: 4 },
      { date: "2026-01-01", value: 3.75 }
    ]
  });
  approx(dashboard.yieldCurveSpread, 0.36);
  assert.deepEqual(dashboard.calendar[0], { date: "2026-01-13", event: "CPI report", region: "US" });
  assert.equal(dashboard.note, "Observed economic data. Scenario analysis is generated separately and is not a forecast.");

  const original = macroSeries.policyRate.observations.splice(0);
  macroSeries.policyRate.observations.push(["2026-01-01", 3.75]);
  assert.equal(macroDashboard().series[0].changeOnePeriod, null);
  assert.equal(macroDashboard().series[0].changeThreePeriods, null);
  macroSeries.policyRate.observations.splice(0, macroSeries.policyRate.observations.length, ...original);
});

test("maps holdings to macro factor exposures", () => {
  assert.deepEqual(exposureMap(null), []);
  const exposures = exposureMap([
    { symbol: "aapl", weightPercent: 60 },
    { symbol: "7203", weightPercent: 10 },
    { symbol: "UNKNOWN", weightPercent: 5 },
    { symbol: "JPM" }
  ]);
  assert.equal(exposures.length, 12);
  assert.deepEqual(exposures[0], {
    factor: "rates",
    symbol: "AAPL",
    sector: "Technology",
    mechanism: "Discount rates and financing costs reprice future cash flows.",
    sensitivity: SECTOR_FACTOR_SENSITIVITY.Technology.rates,
    weightPercent: 60
  });
  assert.deepEqual(exposures.at(-1), {
    factor: "dollar",
    symbol: "JPM",
    sector: "Financials",
    mechanism: "Reported revenue and competitiveness shift with currency moves.",
    sensitivity: 0.2,
    weightPercent: null
  });

  const apple = securityBySymbol("AAPL");
  const originalSector = apple.sector;
  apple.sector = "Utilities";
  assert.deepEqual(exposureMap([{ symbol: "AAPL", weightPercent: 10 }]), []);
  apple.sector = originalSector;
});

test("estimates scenario impacts with and without complete weights", () => {
  assert.equal(MACRO_SCENARIOS.length, 7);
  const weighted = scenarioImpact([
    { symbol: "AAPL", weightPercent: 60 },
    { symbol: "JPM", weightPercent: 40 }
  ], MACRO_SCENARIOS[0]);
  assert.equal(weighted.id, "higher-for-longer");
  assert.deepEqual(weighted.contributions, [
    { symbol: "AAPL", impactPercent: -4.7, weightPercent: 60 },
    { symbol: "JPM", impactPercent: 1.0000000000000002, weightPercent: 40 }
  ]);
  approx(weighted.portfolioImpactPercent, -2.42);
  assert.equal(weighted.basis, "AI-independent factor model applied to user holdings; an estimate, not a forecast");

  const unweighted = scenarioImpact([{ symbol: "AAPL" }], { id: "custom", label: "Custom", factors: { rates: 1 } });
  assert.deepEqual(unweighted.contributions, [{ symbol: "AAPL", impactPercent: -2.4, weightPercent: null }]);
  assert.equal(unweighted.portfolioImpactPercent, null);

  assert.deepEqual(scenarioImpact([], { id: "empty", label: "Empty", factors: {} }), {
    id: "empty",
    label: "Empty",
    contributions: [],
    portfolioImpactPercent: 0,
    basis: "AI-independent factor model applied to user holdings; an estimate, not a forecast"
  });
});

test("combines dashboard, exposures and scenarios", () => {
  const analysis = macroAnalysis([{ symbol: "XOM", weightPercent: 25 }]);
  assert.equal(analysis.dashboard.asOf, "2026-01-01");
  assert.equal(analysis.exposures.length, 4);
  assert.equal(analysis.scenarios.length, MACRO_SCENARIOS.length);
  assert.equal(analysis.scenarios[0].contributions[0].symbol, "XOM");
});
