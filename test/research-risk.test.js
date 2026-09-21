import assert from "node:assert/strict";
import test from "node:test";
import {
  STRESS_SCENARIOS,
  analyzePortfolioRisk,
  benchmarkReturns,
  concentration,
  correlationMatrix,
  interestRateSensitivity,
  liquidity,
  normalizeHoldings,
  portfolioReturns,
  riskHeatMap,
  stressTest
} from "../src/core/research/risk.js";

const approx = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} !== ${expected}`);

const positions = [
  { symbol: "AAPL", name: "Apple", sector: "Technology", region: "North America", currency: "USD", beta: 1.12, value: 600, weight: 0.6 },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", region: "North America", currency: "USD", beta: 1.05, value: 400, weight: 0.4 }
];

test("normalizes holdings from values, quantities and target weights", () => {
  assert.deepEqual(normalizeHoldings(null), []);
  const normalized = normalizeHoldings([
    { symbol: "aapl", value: 600 },
    { symbol: "MSFT", quantity: 2 },
    { symbol: "SAP", weightPercent: 10 },
    { symbol: "UNKNOWN", value: 100 },
    { symbol: "JPM", value: 0 },
    { symbol: "XOM" }
  ], 2_000);
  assert.deepEqual(normalized.map((position) => position.symbol), ["AAPL", "MSFT", "SAP"]);
  assert.equal(normalized[0].name, "Apple");
  approx(normalized[0].weight, 600 / (600 + 837.58 + 200));
  approx(normalized[1].value, 837.58);
  assert.equal(normalized[2].currency, "EUR");

  const reduce = Array.prototype.reduce;
  Array.prototype.reduce = function patchedReduce(callback, initial) {
    if (this.length === 1 && this[0]?.symbol === "AAPL" && this[0]?.value === 1) return 0;
    return reduce.call(this, callback, initial);
  };
  try {
    assert.equal(normalizeHoldings([{ symbol: "AAPL", value: 1 }])[0].weight, 0);
  } finally {
    Array.prototype.reduce = reduce;
  }
});

test("summarizes concentration by position, sector, region and currency", () => {
  const result = concentration(positions);
  assert.deepEqual(result.positions, [
    { symbol: "AAPL", weightPercent: 60 },
    { symbol: "JPM", weightPercent: 40 }
  ]);
  assert.equal(result.largestPositionPercent, 60);
  assert.equal(result.topFivePercent, 100);
  assert.equal(result.herfindahl, 0.52);
  assert.deepEqual(result.bySector, [
    { name: "Technology", weightPercent: 60 },
    { name: "Financials", weightPercent: 40 }
  ]);
  assert.deepEqual(concentration([]).byCurrency, []);
  assert.equal(concentration([]).largestPositionPercent, 0);
});

test("calculates returns, correlations and liquidity from price history", () => {
  const matrix = correlationMatrix(["AAPL", "MSFT"], 30);
  assert.deepEqual(matrix.symbols, ["AAPL", "MSFT"]);
  assert.equal(matrix.values[0][0], 1);
  approx(matrix.values[0][1], matrix.values[1][0]);

  const benchmark = benchmarkReturns(30);
  assert.equal(benchmark.length, 29);
  const returns = portfolioReturns(positions, 30);
  assert.equal(returns.length, 29);
  approx(returns[0], -0.006566784683233707);

  const liquid = liquidity(positions, 30);
  assert.equal(liquid.length, 2);
  assert.equal(liquid[0].symbol, "AAPL");
  assert.equal(liquid[0].averageDailyValue > 0, true);
  assert.equal(liquid[0].daysToLiquidate > 0, true);
  assert.deepEqual(liquidity([{ symbol: "UNKNOWN", value: 100 }]), [{ symbol: "UNKNOWN", averageDailyValue: null, daysToLiquidate: null }]);

  assert.equal(correlationMatrix(["AAPL", "UNKNOWN"], 3).values[0][1], null);
});

test("estimates rate sensitivity and scenario stress", () => {
  const rates = interestRateSensitivity([...positions, { ...positions[0], symbol: "CASH", sector: "Cash", weight: 0.1 }]);
  assert.deepEqual(rates.contributions, [
    { symbol: "AAPL", sector: "Technology", sensitivity: -0.5, weightPercent: 60 },
    { symbol: "JPM", sector: "Financials", sensitivity: 0.6, weightPercent: 40 }
  ]);
  approx(rates.portfolioSensitivity, -0.06);

  assert.equal(STRESS_SCENARIOS.length, 8);
  const stressed = stressTest([{ ...positions[0], currency: "EUR" }, positions[1]], STRESS_SCENARIOS[4]);
  assert.equal(stressed.id, "usd-appreciation");
  assert.deepEqual(stressed.positions, [
    { symbol: "AAPL", impactPercent: -9.36, contributionPercent: -5.616 },
    { symbol: "JPM", impactPercent: -3.1500000000000004, contributionPercent: -1.2600000000000002 }
  ]);
  approx(stressed.estimatedImpactPercent, -6.876);
  assert.equal(stressed.basis, "scenario estimate, not a forecast");

  const custom = stressTest([{ ...positions[0], currency: "EUR" }], { id: "custom", label: "Custom", marketShock: 1 });
  assert.deepEqual(custom.positions, [{ symbol: "AAPL", impactPercent: 1.12, contributionPercent: 0.672 }]);
});

test("classifies heat-map severities", () => {
  const heatMap = riskHeatMap({
    concentration: {
      largestPositionPercent: 30,
      positions: [{ symbol: "AAPL" }, { symbol: "MSFT" }, { symbol: "JPM" }, { symbol: "XOM" }],
      bySector: [{ name: "Technology", weightPercent: 50 }, { name: "Financials", weightPercent: 20 }]
    },
    metrics: { annualizedVolatilityPercent: 20 },
    interestRate: { portfolioSensitivity: -0.1, contributions: [{ symbol: "AAPL" }] }
  });
  assert.deepEqual(heatMap.map((risk) => risk.severity), ["high", "high", "medium", "low"]);
  assert.deepEqual(heatMap[0].contributors, ["AAPL", "MSFT", "JPM"]);

  const empty = riskHeatMap({ concentration: { largestPositionPercent: 10, positions: [], bySector: [] }, metrics: {}, interestRate: { portfolioSensitivity: 0.5, contributions: [] } });
  assert.equal(empty[1].exposure, "0.0% n/a");
  assert.deepEqual(empty.map((risk) => risk.severity), ["low", "low", "low", "high"]);
});

test("analyzes complete portfolio risk and rejects empty portfolios", () => {
  assert.deepEqual(analyzePortfolioRisk([{ symbol: "UNKNOWN", value: 100 }]), { valid: false, errors: ["Add at least one recognised holding."] });

  const analysis = analyzePortfolioRisk([{ symbol: "AAPL", value: 600 }, { symbol: "JPM", value: 400 }], { bars: 90 });
  assert.equal(analysis.valid, true);
  assert.equal(analysis.totalValue, 1_000);
  assert.equal(analysis.positions.length, 2);
  assert.equal(analysis.metrics.observations, 89);
  assert.equal(analysis.metrics.weightedBeta, 1.092);
  assert.equal(analysis.correlations.symbols.join(","), "AAPL,JPM");
  assert.equal(analysis.liquidity.length, 2);
  assert.equal(analysis.scenarios.length, STRESS_SCENARIOS.length);
  assert.equal(analysis.heatMap.length, 4);

  const sparse = analyzePortfolioRisk([{ symbol: "AAPL", value: 1_000 }], { bars: 2 });
  assert.equal(sparse.metrics.annualizedVolatilityPercent, null);
  assert.equal(sparse.metrics.beta, null);

  const emptyReturns = analyzePortfolioRisk([{ symbol: "AAPL", value: 1_000 }], { bars: 1 });
  assert.equal(emptyReturns.metrics.observations, 0);
  assert.equal(emptyReturns.metrics.expectedShortfall95Percent, 0);
});
