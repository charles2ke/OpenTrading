import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEarnings, earningsScenarios, upcomingEarnings } from "../src/core/research/earnings.js";
import { earnings, securityBySymbol } from "../src/core/research/dataset.js";

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

test("analyzes earnings surprises, guidance, reactions, and implied-move scenarios", () => {
  const analysis = analyzeEarnings("aapl");
  assert.equal(analysis.valid, true);
  assert.equal(analysis.symbol, "AAPL");
  assert.equal(analysis.name, "Apple");
  assert.equal(analysis.nextDate, "2026-01-29");
  closeTo(analysis.quarters[0].epsSurprisePercent, ((2.41 - 2.35) / 2.35) * 100);
  closeTo(analysis.quarters[0].revenueSurprisePercent, ((124_300 - 122_800) / 122_800) * 100);
  assert.deepEqual(analysis.guidance[0], {
    metric: "Revenue growth",
    low: 5,
    high: 7,
    consensus: 6.1,
    unit: "%",
    midpoint: 6,
    versusConsensus: -0.09999999999999964
  });
  closeTo(analysis.averageEpsSurprisePercent, 2.1708976536416813);
  closeTo(analysis.averageRevenueSurprisePercent, 1.0898059133378277);
  assert.equal(analysis.beatRate, 1);
  closeTo(analysis.averageReactionPercent, 1.375);
  assert.deepEqual(analysis.impliedMove, { percent: 4.2, basis: "options-implied straddle" });
  assert.equal(analysis.scenarios[0].scenario, "bull");
  closeTo(analysis.scenarios[0].impliedPrice, 241.88988000000002);
  closeTo(analysis.scenarios[1].priceChangePercent, 1.375);
  closeTo(analysis.scenarios[2].impliedPrice, 222.39012);
});

test("reports unknown securities and unavailable earnings histories", () => {
  assert.deepEqual(analyzeEarnings("zzzz"), { valid: false, errors: ["Unknown security."] });
  const analysis = analyzeEarnings("TSLA");
  assert.equal(analysis.valid, false);
  assert.deepEqual(analysis.errors, ["Earnings history is not available for this security."]);
  assert.equal(analysis.unavailable[0].field, "earnings");
  assert.equal(analysis.unavailable[0].available, false);
});

test("handles non-finite or zero surprise denominators without poisoning averages", () => {
  const [first, second] = earnings.AAPL.quarters;
  const originalFirstConsensus = first.consensusEps;
  const originalSecondRevenue = second.reportedRevenue;
  first.consensusEps = 0;
  second.reportedRevenue = Number.NaN;
  try {
    const analysis = analyzeEarnings("AAPL");
    assert.equal(analysis.quarters[0].epsSurprisePercent, null);
    assert.equal(analysis.quarters[1].revenueSurprisePercent, null);
    closeTo(analysis.averageEpsSurprisePercent, 2.043466375068341);
    closeTo(analysis.averageRevenueSurprisePercent, 1.1696880828209648);
  } finally {
    first.consensusEps = originalFirstConsensus;
    second.reportedRevenue = originalSecondRevenue;
  }
});

test("falls back to historical reactions when options-implied move is unavailable", () => {
  const security = securityBySymbol("JPM");
  const analysis = analyzeEarnings("JPM");
  assert.equal(analysis.impliedMove.field, "impliedMove");
  assert.equal(analysis.impliedMove.reason, "reliable options data unavailable");
  closeTo(analysis.scenarios[0].priceChangePercent, 4.4);
  closeTo(analysis.scenarios[2].impliedPrice, security.price * 0.956);

  const scenarios = earningsScenarios(
    [{ priceReaction: -2 }, { priceReaction: 6 }],
    { impliedMovePercent: Number.NaN },
    { price: 50 }
  );
  closeTo(scenarios[0].priceChangePercent, 6);
  closeTo(scenarios[1].priceChangePercent, 2);
  closeTo(scenarios[2].impliedPrice, 47);
});

test("lists upcoming earnings from known symbols after a cutoff", () => {
  assert.deepEqual(upcomingEarnings(["TSLA", "JPM", "AAPL", "MSFT", "UNKNOWN"], "2026-01-20"), [
    { symbol: "MSFT", name: "Microsoft", date: "2026-01-27" },
    { symbol: "AAPL", name: "Apple", date: "2026-01-29" }
  ]);
  assert.deepEqual(upcomingEarnings(), []);
});
