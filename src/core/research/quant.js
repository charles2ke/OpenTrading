import { earnings, macroReleases, priceHistory, securityBySymbol } from "./dataset.js";
import { missing } from "./provenance.js";
import { autocorrelation, isSignificant, maxDrawdown, mean, median, simpleReturns, standardDeviation, tStatistic, winRate } from "./stats.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function statisticsRow(period, values) {
  const tStat = tStatistic(values);
  return {
    period,
    observations: values.length,
    meanPercent: (mean(values) ?? 0) * 100,
    medianPercent: (median(values) ?? 0) * 100,
    winRatePercent: (winRate(values) ?? 0) * 100,
    tStatistic: tStat,
    significant: isSignificant(tStat, values.length),
    note: values.length < 12 ? "Sample too small to be meaningful." : ""
  };
}

function groupReturns(bars, keyOf) {
  const groups = new Map();
  for (let index = 1; index < bars.length; index += 1) {
    const value = bars[index].close / bars[index - 1].close - 1;
    const key = keyOf(bars[index]);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

export function seasonality(bars) {
  const monthly = new Map();
  for (let index = 1; index < bars.length; index += 1) {
    const key = bars[index].date.slice(0, 7);
    const existing = monthly.get(key) ?? { first: bars[index - 1].close, last: bars[index].close };
    monthly.set(key, { ...existing, last: bars[index].close });
  }
  const byMonth = new Map();
  for (const [key, value] of monthly) {
    const month = Number(key.slice(5, 7)) - 1;
    byMonth.set(month, [...(byMonth.get(month) ?? []), value.last / value.first - 1]);
  }
  return {
    monthly: [...byMonth.entries()].sort((left, right) => left[0] - right[0]).map(([month, values]) => statisticsRow(MONTHS[month], values)),
    dayOfWeek: [...groupReturns(bars, (bar) => new Date(`${bar.date}T00:00:00Z`).getUTCDay()).entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([day, values]) => statisticsRow(WEEKDAYS[day], values))
  };
}

export function returnDistribution(returns) {
  const buckets = [-0.05, -0.03, -0.01, 0, 0.01, 0.03, 0.05];
  return buckets.map((threshold, index) => {
    const upper = buckets[index + 1] ?? Infinity;
    const lower = index === 0 ? -Infinity : threshold;
    return {
      from: lower === -Infinity ? null : lower * 100,
      to: upper === Infinity ? null : upper * 100,
      count: returns.filter((value) => value >= lower && value < upper).length
    };
  });
}

export function eventStudy(bars, dates, { before = 5, after = 5 } = {}) {
  const index = new Map(bars.map((bar, position) => [bar.date, position]));
  const windows = [];
  for (const date of dates) {
    const position = index.has(date) ? index.get(date) : bars.findIndex((bar) => bar.date >= date);
    if (position < before || position + after >= bars.length) continue;
    const start = bars[position - before].close;
    windows.push({
      date,
      returns: Array.from({ length: before + after + 1 }, (_, offset) => ({
        offset: offset - before,
        cumulativePercent: (bars[position - before + offset].close / start - 1) * 100
      }))
    });
  }
  if (windows.length === 0) return { observations: 0, average: [], note: "No event windows with sufficient surrounding price history." };
  return {
    observations: windows.length,
    average: Array.from({ length: before + after + 1 }, (_, offset) => ({
      offset: offset - before,
      averageCumulativePercent: mean(windows.map((window) => window.returns[offset].cumulativePercent))
    })),
    note: windows.length < 10 ? "Small sample: treat the averages as indicative only." : ""
  };
}

export function analyzeQuantPatterns(symbol, { bars = 504, benchmarkSymbol = "MSFT" } = {}) {
  const security = securityBySymbol(symbol);
  const history = priceHistory(symbol, { bars });
  if (!security || history.length < 60) return { valid: false, errors: ["Not enough price history for quantitative analysis."] };
  const closes = history.map((bar) => bar.close);
  const returns = simpleReturns(closes);
  const benchmark = simpleReturns(priceHistory(benchmarkSymbol, { bars }).map((bar) => bar.close));
  const eventDates = (earnings[security.symbol]?.quarters ?? [])
    .map((quarter) => quarter.reportDate)
    .filter(Boolean);
  return {
    valid: true,
    errors: [],
    symbol: security.symbol,
    observations: returns.length,
    annualizedVolatilityPercent: standardDeviation(returns) * Math.sqrt(252) * 100,
    maxDrawdownPercent: maxDrawdown(closes) * 100,
    winRatePercent: winRate(returns) * 100,
    autocorrelation: { lag1: autocorrelation(returns, 1), lag5: autocorrelation(returns, 5) },
    distribution: returnDistribution(returns),
    relativePerformancePercent: (closes.at(-1) / closes[0] - 1) * 100 - (benchmark.reduce((total, value) => total + value, 0) * 100),
    seasonality: seasonality(history),
    events: {
      macro: eventStudy(history, macroReleases.map((event) => event.date)),
      earnings: eventDates.length > 0
        ? eventStudy(history, eventDates)
        : { observations: 0, average: [], note: "No dated earnings events available." }
    },
    alternativeData: {
      insiderTransactions: missing("insiderTransactions", "no insider dataset connected"),
      institutionalOwnership: missing("institutionalOwnership", "no ownership dataset connected"),
      shortInterest: missing("shortInterest", "no short-interest dataset connected"),
      optionsActivity: missing("optionsActivity", "no options dataset connected")
    },
    caveat: "Sample size and statistical significance are shown so historical noise is not mistaken for an edge."
  };
}
