import assert from "node:assert/strict";
import test from "node:test";
import {
  TIMEFRAMES,
  analyzeTechnicals,
  atr,
  bollingerBands,
  detectSignals,
  ema,
  fibonacciLevels,
  macd,
  range52Week,
  relativeStrength,
  resample,
  rsi,
  sma,
  supportResistance,
  tradePlan
} from "../src/core/research/technicals.js";

const closeBars = [
  { date: "2026-01-01", open: 10, high: 11, low: 9, close: 10, volume: 100 },
  { date: "2026-01-02", open: 11, high: 12, low: 10, close: 11, volume: 200 },
  { date: "2026-01-05", open: 12, high: 13, low: 11, close: 12, volume: 300 },
  { date: "2026-02-02", open: 13, high: 14, low: 12, close: 13, volume: 400 }
];

const approx = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} !== ${expected}`);

test("resamples daily, weekly, monthly and unsupported timeframes", () => {
  assert.deepEqual(TIMEFRAMES, ["daily", "weekly", "monthly"]);
  assert.notEqual(resample(closeBars), closeBars);
  assert.deepEqual(resample(closeBars, "intraday"), closeBars);

  const weekly = resample(closeBars, "weekly");
  assert.equal(weekly.length, 2);
  assert.deepEqual(weekly[0], { date: "2026-01-05", open: 10, high: 13, low: 9, close: 12, volume: 600 });

  const monthly = resample(closeBars, "monthly");
  assert.equal(monthly.length, 2);
  assert.deepEqual(monthly[0], { date: "2026-01-05", open: 10, high: 13, low: 9, close: 12, volume: 600 });
});

test("calculates moving averages and momentum indicators", () => {
  assert.equal(sma(null, 2), null);
  assert.equal(sma([1], 2), null);
  assert.equal(sma([1, 2], 0), null);
  assert.equal(sma([1, 2, 3], 2), 2.5);

  assert.equal(ema(null, 2), null);
  assert.equal(ema([1], 2), null);
  assert.equal(ema([1, 2], 0), null);
  assert.equal(ema([1, 2, 3], 2), 2.5);

  assert.equal(rsi(null), null);
  assert.equal(rsi([1, 2], 2), null);
  assert.equal(rsi([1, 2, 3], 2), 100);
  approx(rsi([3, 2, 4], 2), 66.66666666666666);

  assert.equal(macd(null), null);
  assert.equal(macd(Array.from({ length: 34 }, (_, index) => index + 1)), null);
  const result = macd(Array.from({ length: 35 }, (_, index) => index + 1));
  assert.equal(Object.keys(result).join(","), "macd,signal,histogram");
  assert.equal(Number.isFinite(result.histogram), true);
});

test("calculates bands, ranges, support, resistance and relative strength", () => {
  assert.equal(bollingerBands([1], 2), null);
  const bands = bollingerBands([1, 2, 3, 4, 5], 5, 2);
  assert.equal(bands.middle, 3);
  approx(bands.upper, 6.16227766016838);
  approx(bands.lower, -0.16227766016837952);
  approx(bands.width, 2.1081851067789197);

  assert.equal(atr(null), null);
  assert.equal(atr(closeBars.slice(0, 2), 2), null);
  assert.equal(atr(closeBars, 2), 2);

  assert.deepEqual(range52Week([{ high: 5, low: 5, close: 5 }]), { high: 5, low: 5, close: 5, positionPercent: 0 });
  assert.deepEqual(range52Week(closeBars), { high: 14, low: 9, close: 13, positionPercent: 80 });
  assert.deepEqual(supportResistance([{ high: 10, low: 10, close: 10 }]), { support: null, resistance: null, lookback: 1 });
  assert.deepEqual(supportResistance(closeBars, 3), { support: 12, resistance: 14, lookback: 3 });
  assert.deepEqual(fibonacciLevels(closeBars, 2), [
    { ratio: 0, price: 14 },
    { ratio: 0.236, price: 13.292 },
    { ratio: 0.382, price: 12.854 },
    { ratio: 0.5, price: 12.5 },
    { ratio: 0.618, price: 12.146 },
    { ratio: 0.786, price: 11.642 },
    { ratio: 1, price: 11 }
  ]);

  assert.equal(relativeStrength([1, 2], [1, 2], 2), null);
  approx(relativeStrength([100, 110, 121], [100, 100, 110], 2), 11);
});

test("detects bullish, bearish and neutral technical signals", () => {
  const bullish = detectSignals({
    sma50: 110,
    sma200: 100,
    rsi14: 25,
    macdResult: { histogram: 2 },
    bands: { upper: 130, lower: 95 },
    volumeAverage: 100,
    levels: { resistance: 101 }
  }, [{ close: 102, volume: 200 }]);
  assert.deepEqual(bullish.map((entry) => [entry.name, entry.direction]), [
    ["Moving-average trend", "bullish"],
    ["RSI", "bullish"],
    ["MACD", "bullish"],
    ["Breakout watch", "bullish"],
    ["Volume confirmation", "neutral"]
  ]);
  assert.equal(bullish[0].basis, "probabilistic technical observation");

  const bearish = detectSignals({
    sma50: 90,
    sma200: 100,
    rsi14: 75,
    macdResult: { histogram: -1 },
    bands: { upper: 105, lower: 80 },
    volumeAverage: null,
    levels: { resistance: null }
  }, [{ close: 106, volume: 100 }]);
  assert.deepEqual(bearish.map((entry) => [entry.name, entry.direction]), [
    ["Moving-average trend", "bearish"],
    ["RSI", "bearish"],
    ["MACD", "bearish"],
    ["Bollinger bands", "bearish"]
  ]);

  const lowerBand = detectSignals({ sma50: null, sma200: null, rsi14: null, macdResult: null, bands: { upper: 120, lower: 90 }, volumeAverage: null, levels: { resistance: null } }, [{ close: 80, volume: 1 }]);
  assert.equal(lowerBand[0].direction, "bullish");
});

test("builds trade plans and rejects invalid assumptions", () => {
  assert.deepEqual(tradePlan({ entry: 0, stop: 9, target: 15, capital: 1_000 }), { valid: false, errors: ["Entry, stop, target and capital must be positive numbers."] });
  assert.deepEqual(tradePlan({ entry: 10, stop: 10, target: 15, capital: 1_000 }), { valid: false, errors: ["The invalidation level must sit below the entry."] });
  assert.deepEqual(tradePlan({ entry: 10, stop: 8, target: 16, capital: 105 }), {
    valid: true,
    errors: [],
    entry: 10,
    stop: 8,
    target: 16,
    shares: 10,
    riskPerShare: 2,
    rewardPerShare: 6,
    riskReward: 3,
    riskAmount: 20,
    rewardAmount: 60,
    basis: "hypothetical plan from user assumptions"
  });
});

test("analyzes technicals from the reference dataset", () => {
  assert.deepEqual(analyzeTechnicals("UNKNOWN", { bars: 10 }), { valid: false, errors: ["Not enough price history for technical analysis."] });
  const analysis = analyzeTechnicals("aapl", { timeframe: "weekly", bars: 504, benchmarkSymbol: "MSFT" });
  assert.equal(analysis.valid, true);
  assert.equal(analysis.symbol, "AAPL");
  assert.equal(analysis.timeframe, "weekly");
  assert.equal(analysis.bars > 60, true);
  assert.equal(analysis.indicators.sma20 > 0, true);
  assert.equal(analysis.indicators.sma100 > 0, true);
  assert.equal(analysis.fibonacci.length, 7);
  assert.equal(Array.isArray(analysis.signals), true);
});
