import assert from "node:assert/strict";
import test from "node:test";
import { autocorrelation, beta, correlation, covariance, isSignificant, maxDrawdown, mean, median, percentile, simpleReturns, standardDeviation, tStatistic, winRate } from "../src/core/research/stats.js";

const closeEnough = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} !== ${expected}`);

test("calculates averages, medians, deviations, and percentiles", () => {
  assert.equal(mean(null), null);
  assert.equal(mean([]), null);
  assert.equal(mean([1, 2, 6]), 3);

  assert.equal(median(undefined), null);
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 2, 9]), 3);

  assert.equal(standardDeviation(null), null);
  assert.equal(standardDeviation([1]), null);
  closeEnough(standardDeviation([1, 2, 3]), 1);

  assert.equal(percentile(null, 0.5), null);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([10, 20, 30], -1), 10);
  assert.equal(percentile([10, 20, 30], 0.5), 20);
  assert.equal(percentile([10, 20, 30], 2), 30);
});

test("derives returns, covariance, correlation, and beta", () => {
  assert.deepEqual(simpleReturns(null), []);
  assert.deepEqual(simpleReturns([100]), []);
  const returns = simpleReturns([100, 110, 99]);
  closeEnough(returns[0], 0.1);
  closeEnough(returns[1], -0.1);

  assert.equal(covariance([1], [2]), null);
  assert.equal(covariance([1, 2, 3], [2, 4]), 1);
  assert.equal(correlation([1], [2]), null);
  assert.equal(correlation([1, 1, 1], [2, 3, 4]), null);
  closeEnough(correlation([1, 2, 3], [2, 4, 6]), 1);

  assert.equal(beta([1, 2, 3], [5, 5, 5]), null);
  assert.equal(beta([1], [2]), null);
  closeEnough(beta([1, 2, 3], [2, 4, 6]), 0.5);
});

test("measures drawdowns and autocorrelation", () => {
  assert.equal(maxDrawdown(null), null);
  assert.equal(maxDrawdown([100]), null);
  assert.equal(maxDrawdown([100, 120, 90, 130, 117]), -0.25);

  assert.equal(autocorrelation(null), null);
  assert.equal(autocorrelation([1, 2], 1), null);
  closeEnough(autocorrelation([1, 2, 3, 4], 1), 1);
});

test("evaluates t statistics, significance, and win rates", () => {
  assert.equal(tStatistic([1, 1, 1]), null);
  closeEnough(tStatistic([1, 2, 3]), Math.sqrt(3) * 2);

  assert.equal(isSignificant(null, 10), false);
  assert.equal(isSignificant(2.5, 2), false);
  assert.equal(isSignificant(1.5, 10), false);
  assert.equal(isSignificant(-2, 10), true);

  assert.equal(winRate(undefined), null);
  assert.equal(winRate([]), null);
  assert.equal(winRate([-1, 0, 2, 3]), 0.5);
});
