import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDividendPortfolio, dividendProfile, dividendSafety, simulateDrip } from "../src/core/research/dividends.js";
import { fundamentals } from "../src/core/research/dataset.js";

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

test("builds a dividend profile with payout, balance-sheet, and safety details", () => {
  const profile = dividendProfile("msft");
  assert.equal(profile.valid, true);
  assert.equal(profile.symbol, "MSFT");
  assert.equal(profile.currency, "USD");
  assert.equal(profile.yieldPercent, 0.78);
  closeTo(profile.fcfPayoutRatioPercent, (3.28 * 7_430 / 78_600) * 100);
  assert.deepEqual(profile.cagr, { threeYear: 10.1, fiveYear: 10.4, tenYear: 11.2 });
  assert.deepEqual(profile.balanceSheet, { debtToEquity: 0.32, freeCashFlow: 78_600 });
  assert.equal(profile.safety.rating, "resilient");
  assert.equal(profile.safety.score, 10);
});

test("returns null free-cash-flow payout when free cash flow is not positive", () => {
  const originalFreeCashFlow = fundamentals.MSFT.freeCashFlow;
  fundamentals.MSFT.freeCashFlow = 0;
  try {
    const profile = dividendProfile("MSFT");
    assert.equal(profile.valid, true);
    assert.equal(profile.fcfPayoutRatioPercent, null);
    assert.equal(profile.safety.factors[1].points, 0);
  } finally {
    fundamentals.MSFT.freeCashFlow = originalFreeCashFlow;
  }
});

test("rejects unknown, non-dividend, and missing-yield securities", () => {
  assert.deepEqual(dividendProfile("NOPE"), { valid: false, errors: ["Unknown security."] });
  const profile = dividendProfile("TSLA");
  assert.equal(profile.valid, false);
  assert.deepEqual(profile.errors, ["This security does not currently pay a dividend."]);
  assert.equal(profile.unavailable[0].field, "dividend");

  const originalYield = fundamentals.NVDA.dividendYield;
  fundamentals.NVDA.dividendYield = 0;
  try {
    const missingYield = dividendProfile("NVDA");
    assert.equal(missingYield.valid, false);
    assert.deepEqual(missingYield.errors, ["This security does not currently pay a dividend."]);
  } finally {
    fundamentals.NVDA.dividendYield = originalYield;
  }
});

test("scores dividend safety across resilient, adequate, and fragile inputs", () => {
  assert.equal(dividendSafety({
    record: { consecutiveGrowthYears: 10, lastCutYear: null },
    metrics: { payoutRatio: 40, debtToEquity: 0.6 },
    fcfPayoutRatio: 50
  }).rating, "resilient");

  const adequate = dividendSafety({
    record: { consecutiveGrowthYears: 5, lastCutYear: 2020 },
    metrics: { payoutRatio: 65, debtToEquity: 1.3 },
    fcfPayoutRatio: 80
  });
  assert.equal(adequate.score, 4);
  assert.equal(adequate.rating, "fragile");
  assert.deepEqual(adequate.factors.map((factor) => factor.points), [1, 1, 1, 1, 0]);

  const fragile = dividendSafety({
    record: { consecutiveGrowthYears: 0, lastCutYear: 2020 },
    metrics: { payoutRatio: 90, debtToEquity: 2 },
    fcfPayoutRatio: null
  });
  assert.equal(fragile.score, 0);
  assert.equal(fragile.rating, "fragile");

  assert.equal(dividendSafety({
    record: { consecutiveGrowthYears: 8, lastCutYear: null },
    metrics: { payoutRatio: 55, debtToEquity: 1 },
    fcfPayoutRatio: 70
  }).rating, "adequate");
  assert.equal(dividendSafety({
    record: { consecutiveGrowthYears: 8, lastCutYear: null },
    metrics: { payoutRatio: 55, debtToEquity: 1 },
    fcfPayoutRatio: 90
  }).factors[1].points, 0);
});

test("analyzes a dividend portfolio and records unavailable holdings", () => {
  const portfolio = analyzeDividendPortfolio([
    { symbol: "MSFT", quantity: 2 },
    { symbol: "XOM", value: 1_000 },
    { symbol: "TSLA", quantity: 1 },
    { symbol: "BAD", value: 500 },
    { symbol: "AAPL", value: 0 },
    { symbol: "MSFT", quantity: Number.NaN },
    null
  ]);
  assert.equal(portfolio.valid, true);
  assert.deepEqual(portfolio.errors, []);
  assert.deepEqual(portfolio.unavailable, ["TSLA", "BAD", "AAPL", "MSFT", ""]);
  closeTo(portfolio.totalValue, 1_837.58);
  closeTo(portfolio.annualIncome, (837.58 * 0.78) / 100 + 34.8);
  closeTo(portfolio.weightedYieldPercent, (portfolio.annualIncome / portfolio.totalValue) * 100);
  closeTo(portfolio.quarterlyIncome, portfolio.annualIncome / 4);
  closeTo(portfolio.monthlyIncome, portfolio.annualIncome / 12);
  assert.deepEqual(portfolio.sectorDiversification.map((sector) => sector.name), ["Energy", "Technology"]);
  closeTo(portfolio.incomeConcentrationPercent, 34.8 / portfolio.annualIncome * 100);

  assert.deepEqual(analyzeDividendPortfolio().valid, false);
  assert.deepEqual(analyzeDividendPortfolio([]).errors, ["Add at least one dividend-paying holding."]);
});

test("keeps diversification weights at zero when aggregate value is zero", () => {
  const originalReduce = Array.prototype.reduce;
  Array.prototype.reduce = function patchedReduce(callback, ...args) {
    if (this[0]?.symbol === "MSFT" && this[0]?.annualIncome && String(callback).includes("position.value")) {
      return 0;
    }
    return originalReduce.call(this, callback, ...args);
  };
  try {
    const portfolio = analyzeDividendPortfolio([{ symbol: "MSFT", quantity: 1 }]);
    assert.equal(portfolio.valid, true);
    assert.equal(portfolio.totalValue, 0);
    assert.equal(portfolio.weightedYieldPercent, 0);
    assert.deepEqual(portfolio.sectorDiversification, [{ name: "Technology", weightPercent: 0 }]);
  } finally {
    Array.prototype.reduce = originalReduce;
  }
});


test("simulates dividend reinvestment and cash-income projections", () => {
  const drip = simulateDrip({
    initialInvestment: 10_000,
    annualContribution: 1_000,
    startingYieldPercent: 4,
    dividendGrowthPercent: 5,
    priceGrowthPercent: 3,
    years: 2
  });
  assert.equal(drip.valid, true);
  assert.equal(drip.reinvest, true);
  closeTo(drip.rows[0].income, 400);
  closeTo(drip.rows[0].value, 11_700);
  closeTo(drip.rows[1].income, 491.40000000000003);
  closeTo(drip.finalValue, 13_542.4);
  assert.deepEqual(drip.milestones, []);
  assert.equal(drip.basis, "projection from user assumptions, not a forecast");

  const cash = simulateDrip({ initialInvestment: 1_000, startingYieldPercent: 10, reinvest: false, years: 5 });
  assert.equal(cash.rows.at(-1).year, 5);
  closeTo(cash.rows.at(-1).cumulativeCashIncome, 500);
  assert.deepEqual(cash.milestones.map((row) => row.year), [5]);

  assert.deepEqual(simulateDrip({ initialInvestment: 0, startingYieldPercent: 4 }), {
    valid: false,
    errors: ["Provide a positive initial investment and a starting yield."]
  });
  assert.deepEqual(simulateDrip({ initialInvestment: 100, startingYieldPercent: -1 }), {
    valid: false,
    errors: ["Provide a positive initial investment and a starting yield."]
  });
  assert.deepEqual(simulateDrip({ initialInvestment: 100, startingYieldPercent: Number.NaN }), {
    valid: false,
    errors: ["Provide a positive initial investment and a starting yield."]
  });
  assert.deepEqual(simulateDrip({ initialInvestment: 100, startingYieldPercent: 4, years: 51 }), {
    valid: false,
    errors: ["Choose a projection horizon between 1 and 50 years."]
  });
  assert.deepEqual(simulateDrip({ initialInvestment: 100, startingYieldPercent: 4, years: 0 }), {
    valid: false,
    errors: ["Choose a projection horizon between 1 and 50 years."]
  });
  assert.deepEqual(simulateDrip({ initialInvestment: 100, startingYieldPercent: 4, years: 1.5 }), {
    valid: false,
    errors: ["Choose a projection horizon between 1 and 50 years."]
  });
});
