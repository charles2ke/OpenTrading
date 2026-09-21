import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSET_CLASSES,
  BENCHMARKS,
  RISK_PROFILES,
  buildPortfolio,
  contributionPlan,
  coreSatellite,
  portfolioStatistics,
  rebalancePlan,
  targetAllocation,
  taxGuidance
} from "../src/core/research/portfolio-builder.js";

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

test("exports asset classes, risk profiles, and benchmarks", () => {
  assert.equal(ASSET_CLASSES.length, 8);
  assert.equal(ASSET_CLASSES[0].etf, "VTI");
  assert.equal(RISK_PROFILES.balanced["domestic-equity"], 35);
  assert.equal(BENCHMARKS.growth, "80% global equities / 20% bonds");
});

test("calculates target allocations with risk, horizon, liquidity, and income adjustments", () => {
  assert.deepEqual(targetAllocation({ riskTolerance: "nonsense" }), RISK_PROFILES.balanced);
  const shortHorizon = targetAllocation({ riskTolerance: "growth", horizonYears: 4 });
  assert.equal(shortHorizon["domestic-equity"], 38);
  assert.equal(shortHorizon["international-equity"], 17);
  assert.equal(shortHorizon["government-bonds"], 22);
  assert.equal(shortHorizon.cash, 8);
  assert.equal(targetAllocation({ incomeRequirementPercent: 2 })["corporate-bonds"], 13);

  const liquidityAndIncome = targetAllocation({
    riskTolerance: "conservative",
    horizonYears: Number.NaN,
    liquidityRequirementPercent: 25,
    incomeRequirementPercent: 3
  });
  assert.deepEqual(liquidityAndIncome, {
    "domestic-equity": 0,
    "international-equity": 9.70873786407767,
    "government-bonds": 33.980582524271846,
    "corporate-bonds": 24.271844660194176,
    cash: 24.271844660194176,
    reits: 7.766990291262135,
    commodities: 0,
    alternatives: 0
  });
});

test("returns all-zero allocations when a risk profile has no weight", () => {
  const original = { ...RISK_PROFILES.balanced };
  for (const key of Object.keys(RISK_PROFILES.balanced)) RISK_PROFILES.balanced[key] = 0;
  try {
    assert.deepEqual(targetAllocation({ riskTolerance: "balanced" }), RISK_PROFILES.balanced);
  } finally {
    Object.assign(RISK_PROFILES.balanced, original);
  }
});

test("splits core and satellite allocations while clamping satellite size", () => {
  assert.deepEqual(coreSatellite({ cash: 10, reits: 90 }, -5), {
    core: [{ id: "cash", weightPercent: 10 }, { id: "reits", weightPercent: 90 }],
    satellite: { weightPercent: 0, purpose: "Higher-conviction single securities or thematic exposure." }
  });
  assert.deepEqual(coreSatellite({ cash: 50 }, 99), {
    core: [{ id: "cash", weightPercent: 30 }],
    satellite: { weightPercent: 40, purpose: "Higher-conviction single securities or thematic exposure." }
  });
});

test("computes portfolio statistics including zero-volatility edge cases", () => {
  const stats = portfolioStatistics({ "domestic-equity": 60, "government-bonds": 40, unsupported: 50 });
  closeTo(stats.expectedReturnPercent, 6.0200000000000005);
  closeTo(stats.incomeYieldPercent, 2.38);
  closeTo(stats.volatilityPercent, 10.669612926437397);
  closeTo(stats.sharpeRatio, 0.2643019966556184);
  assert.deepEqual(portfolioStatistics({}), {
    expectedReturnPercent: 0,
    volatilityPercent: 0,
    incomeYieldPercent: 0,
    sharpeRatio: null
  });
});

test("plans rebalancing and contributions from target weights", () => {
  const plan = rebalancePlan(
    { cash: 10, "domestic-equity": 90, custom: 0 },
    [{ assetClass: "cash", value: 50 }, { assetClass: "cash", value: Number.NaN }, { assetClass: "domestic-equity", value: 150 }],
    800
  );
  assert.deepEqual(plan, [
    {
      id: "cash",
      label: "Cash",
      etf: "BIL",
      targetPercent: 10,
      currentPercent: 5,
      currentValue: 50,
      targetValue: 100,
      tradeValue: 50
    },
    {
      id: "domestic-equity",
      label: "Domestic equities",
      etf: "VTI",
      targetPercent: 90,
      currentPercent: 15,
      currentValue: 150,
      targetValue: 900,
      tradeValue: 750
    },
    {
      id: "custom",
      label: "custom",
      etf: null,
      targetPercent: 0,
      currentPercent: 0,
      currentValue: 0,
      targetValue: 0,
      tradeValue: 0
    }
  ]);
  assert.deepEqual(rebalancePlan({ cash: 100 })[0].currentPercent, 0);
  assert.deepEqual(contributionPlan({ cash: 25, reits: 75 }, 200), [
    { id: "cash", weightPercent: 25, amount: 50 },
    { id: "reits", weightPercent: 75, amount: 150 }
  ]);
});

test("provides tax notes for account types and builds portfolios", () => {
  assert.deepEqual(taxGuidance(), [
    "General information only — this is not personalised tax advice.",
    "Consider holding income-producing assets in tax-advantaged accounts where your rules allow it."
  ]);
  assert.equal(taxGuidance({ accountType: "taxable" }).at(-1), "In a taxable account, frequent rebalancing can realise gains; consider rebalancing with new contributions first.");
  assert.equal(taxGuidance({ accountType: "tax-advantaged" }).at(-1), "Tax-advantaged accounts usually let you rebalance without an immediate tax event.");

  assert.deepEqual(buildPortfolio({ investmentAmount: 0 }), {
    valid: false,
    errors: ["Enter an investment amount greater than zero."]
  });
  assert.deepEqual(buildPortfolio({ investmentAmount: Number.NaN }), {
    valid: false,
    errors: ["Enter an investment amount greater than zero."]
  });
  const built = buildPortfolio({
    investmentAmount: 10_000,
    riskTolerance: "aggressive",
    satellitePercent: 10,
    monthlyContribution: 500,
    accountType: "taxable",
    existingHoldings: [{ assetClass: "cash", value: 1_000 }]
  });
  assert.equal(built.valid, true);
  assert.equal(built.benchmark, "100% global equities");
  assert.equal(built.allocation.length, 8);
  assert.equal(built.coreSatellite.satellite.weightPercent, 10);
  assert.equal(built.contributions[0].amount, 290);
  assert.equal(built.rebalancingRules.length, 3);
  assert.match(built.taxNotes.at(-1), /taxable account/);

  const defaults = buildPortfolio({ investmentAmount: 100 });
  assert.equal(defaults.benchmark, "60% global equities / 40% bonds");
  assert.equal(defaults.coreSatellite.satellite.weightPercent, 20);
  assert.equal(defaults.contributions[0].amount, 0);
});
