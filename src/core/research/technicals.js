import { priceHistory } from "./dataset.js";
import { mean, simpleReturns, standardDeviation } from "./stats.js";

export const TIMEFRAMES = Object.freeze(["daily", "weekly", "monthly"]);

export function resample(bars, timeframe = "daily") {
  if (timeframe === "daily" || !TIMEFRAMES.includes(timeframe)) return [...bars];
  const buckets = new Map();
  for (const bar of bars) {
    const key = timeframe === "weekly"
      ? `${bar.date.slice(0, 4)}-W${Math.floor(Date.parse(bar.date) / (7 * 86_400_000))}`
      : bar.date.slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { ...bar });
      continue;
    }
    bucket.high = Math.max(bucket.high, bar.high);
    bucket.low = Math.min(bucket.low, bar.low);
    bucket.close = bar.close;
    bucket.date = bar.date;
    bucket.volume += bar.volume;
  }
  return [...buckets.values()];
}

export function sma(values, period) {
  if (!values || values.length < period || period < 1) return null;
  return mean(values.slice(-period));
}

export function ema(values, period) {
  if (!values || values.length < period || period < 1) return null;
  const multiplier = 2 / (period + 1);
  let current = mean(values.slice(0, period));
  for (const value of values.slice(period)) current = (value - current) * multiplier + current;
  return current;
}

export function rsi(values, period = 14) {
  if (!values || values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  const strength = (gains / period) / (losses / period);
  return 100 - 100 / (1 + strength);
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  if (!values || values.length < slow + signalPeriod) return null;
  const line = [];
  for (let index = slow; index <= values.length; index += 1) {
    const window = values.slice(0, index);
    line.push(ema(window, fast) - ema(window, slow));
  }
  const signal = ema(line, signalPeriod);
  const current = line.at(-1);
  return { macd: current, signal, histogram: current - signal };
}

export function bollingerBands(values, period = 20, deviations = 2) {
  const middle = sma(values, period);
  const spread = standardDeviation(values.slice(-period));
  if (middle === null || spread === null) return null;
  return { middle, upper: middle + deviations * spread, lower: middle - deviations * spread, width: (2 * deviations * spread) / middle };
}

export function atr(bars, period = 14) {
  if (!bars || bars.length <= period) return null;
  const ranges = [];
  for (let index = bars.length - period; index < bars.length; index += 1) {
    const bar = bars[index];
    const previousClose = bars[index - 1].close;
    ranges.push(Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose)));
  }
  return mean(ranges);
}

export function range52Week(bars) {
  const window = bars.slice(-252);
  const high = Math.max(...window.map((bar) => bar.high));
  const low = Math.min(...window.map((bar) => bar.low));
  const close = window.at(-1).close;
  return { high, low, close, positionPercent: high === low ? 0 : ((close - low) / (high - low)) * 100 };
}

export function supportResistance(bars, lookback = 60) {
  const window = bars.slice(-lookback);
  const closes = window.map((bar) => bar.close);
  const close = closes.at(-1);
  const below = window.map((bar) => bar.low).filter((low) => low < close);
  const above = window.map((bar) => bar.high).filter((high) => high > close);
  return {
    support: below.length === 0 ? null : Math.max(...below),
    resistance: above.length === 0 ? null : Math.min(...above),
    lookback: window.length
  };
}

export function fibonacciLevels(bars, lookback = 120) {
  const window = bars.slice(-lookback);
  const high = Math.max(...window.map((bar) => bar.high));
  const low = Math.min(...window.map((bar) => bar.low));
  return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => ({ ratio, price: high - (high - low) * ratio }));
}

export function relativeStrength(symbolCloses, benchmarkCloses, period = 63) {
  if (symbolCloses.length <= period || benchmarkCloses.length <= period) return null;
  const symbolReturn = symbolCloses.at(-1) / symbolCloses.at(-1 - period) - 1;
  const benchmarkReturn = benchmarkCloses.at(-1) / benchmarkCloses.at(-1 - period) - 1;
  return (symbolReturn - benchmarkReturn) * 100;
}

function signal(name, direction, detail, confidence) {
  return { name, direction, detail, confidence, basis: "probabilistic technical observation" };
}

export function detectSignals(indicators, bars) {
  const signals = [];
  const close = bars.at(-1).close;
  const { sma50, sma200, rsi14, macdResult, bands, volumeAverage, levels } = indicators;
  if (sma50 !== null && sma200 !== null) {
    signals.push(sma50 > sma200
      ? signal("Moving-average trend", "bullish", "50-day average above the 200-day average.", "moderate")
      : signal("Moving-average trend", "bearish", "50-day average below the 200-day average.", "moderate"));
  }
  if (rsi14 !== null && rsi14 >= 70) signals.push(signal("RSI", "bearish", `RSI of ${rsi14.toFixed(1)} suggests stretched momentum.`, "low"));
  if (rsi14 !== null && rsi14 <= 30) signals.push(signal("RSI", "bullish", `RSI of ${rsi14.toFixed(1)} suggests washed-out momentum.`, "low"));
  if (macdResult) {
    signals.push(macdResult.histogram > 0
      ? signal("MACD", "bullish", "MACD line above its signal line.", "moderate")
      : signal("MACD", "bearish", "MACD line below its signal line.", "moderate"));
  }
  if (bands && close > bands.upper) signals.push(signal("Bollinger bands", "bearish", "Price is trading above the upper band.", "low"));
  if (bands && close < bands.lower) signals.push(signal("Bollinger bands", "bullish", "Price is trading below the lower band.", "low"));
  if (levels.resistance !== null && close > levels.resistance * 0.99) {
    signals.push(signal("Breakout watch", "bullish", "Price is testing recent resistance.", "low"));
  }
  if (volumeAverage !== null && bars.at(-1).volume > volumeAverage * 1.5) {
    signals.push(signal("Volume confirmation", "neutral", "Latest volume is more than 50% above its average.", "moderate"));
  }
  return signals;
}

export function tradePlan({ entry, stop, target, capital }) {
  if (![entry, stop, target, capital].every((value) => Number.isFinite(value) && value > 0)) {
    return { valid: false, errors: ["Entry, stop, target and capital must be positive numbers."] };
  }
  if (stop >= entry) return { valid: false, errors: ["The invalidation level must sit below the entry."] };
  const riskPerShare = entry - stop;
  const rewardPerShare = target - entry;
  const shares = Math.floor(capital / entry);
  return {
    valid: true,
    errors: [],
    entry,
    stop,
    target,
    shares,
    riskPerShare,
    rewardPerShare,
    riskReward: rewardPerShare / riskPerShare,
    riskAmount: riskPerShare * shares,
    rewardAmount: rewardPerShare * shares,
    basis: "hypothetical plan from user assumptions"
  };
}

export function analyzeTechnicals(symbol, { timeframe = "daily", bars = 504, benchmarkSymbol = "MSFT" } = {}) {
  const history = resample(priceHistory(symbol, { bars }), timeframe);
  if (history.length < 60) return { valid: false, errors: ["Not enough price history for technical analysis."] };
  const closes = history.map((bar) => bar.close);
  const indicators = {
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma100: sma(closes, 100),
    sma200: sma(closes, 200),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    rsi14: rsi(closes),
    macdResult: macd(closes),
    bands: bollingerBands(closes),
    atr14: atr(history),
    volumeAverage: sma(history.map((bar) => bar.volume), 20),
    levels: supportResistance(history),
    range: range52Week(history),
    relativeStrength: relativeStrength(closes, resample(priceHistory(benchmarkSymbol, { bars }), timeframe).map((bar) => bar.close)),
    realizedVolatilityPercent: standardDeviation(simpleReturns(closes)) * Math.sqrt(252) * 100
  };
  return {
    valid: true,
    errors: [],
    symbol: String(symbol).toUpperCase(),
    timeframe,
    bars: history.length,
    history,
    indicators,
    fibonacci: fibonacciLevels(history),
    signals: detectSignals(indicators, history)
  };
}
