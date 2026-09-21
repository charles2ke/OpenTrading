import { missing, sourced } from "./provenance.js";

export const DATA_PROVIDER = "OpenTrading reference dataset";
export const DATA_SOURCE = "simulated-market-data";
export const DATA_AS_OF = "2026-01-05T21:00:00.000Z";

function meta(field, currency = "USD") {
  return { field, provider: DATA_PROVIDER, source: DATA_SOURCE, asOf: DATA_AS_OF, retrievedAt: DATA_AS_OF, currency };
}

export const securities = Object.freeze([
  {
    symbol: "AAPL", name: "Apple", exchange: "NASDAQ", currency: "USD", country: "US", region: "North America",
    sector: "Technology", industry: "Consumer Electronics", price: 232.14, previousClose: 228.76,
    marketCap: 3_510_000, dilutedShares: 15_120, netDebt: 47_000, beta: 1.12, peers: ["MSFT", "NVDA", "SAP"]
  },
  {
    symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ", currency: "USD", country: "US", region: "North America",
    sector: "Technology", industry: "Software", price: 418.79, previousClose: 420.43,
    marketCap: 3_110_000, dilutedShares: 7_430, netDebt: -34_000, beta: 0.97, peers: ["AAPL", "NVDA", "SAP"]
  },
  {
    symbol: "NVDA", name: "NVIDIA", exchange: "NASDAQ", currency: "USD", country: "US", region: "North America",
    sector: "Technology", industry: "Semiconductors", price: 138.25, previousClose: 134.9,
    marketCap: 3_380_000, dilutedShares: 24_450, netDebt: -26_000, beta: 1.68, peers: ["AAPL", "MSFT", "TSLA"]
  },
  {
    symbol: "TSLA", name: "Tesla", exchange: "NASDAQ", currency: "USD", country: "US", region: "North America",
    sector: "Consumer Discretionary", industry: "Automobiles", price: 351.62, previousClose: 342.11,
    marketCap: 1_120_000, dilutedShares: 3_190, netDebt: -22_000, beta: 2.05, peers: ["NVDA", "7203", "AAPL"]
  },
  {
    symbol: "JPM", name: "JPMorgan Chase", exchange: "NYSE", currency: "USD", country: "US", region: "North America",
    sector: "Financials", industry: "Diversified Banks", price: 241.18, previousClose: 239.4,
    marketCap: 678_000, dilutedShares: 2_810, netDebt: 0, beta: 1.05, peers: ["HSBA", "XOM", "JNJ"]
  },
  {
    symbol: "XOM", name: "Exxon Mobil", exchange: "NYSE", currency: "USD", country: "US", region: "North America",
    sector: "Energy", industry: "Integrated Oil & Gas", price: 112.36, previousClose: 110.78,
    marketCap: 492_000, dilutedShares: 4_380, netDebt: 24_000, beta: 0.84, peers: ["JPM", "JNJ", "HSBA"]
  },
  {
    symbol: "JNJ", name: "Johnson & Johnson", exchange: "NYSE", currency: "USD", country: "US", region: "North America",
    sector: "Health Care", industry: "Pharmaceuticals", price: 154.72, previousClose: 153.9,
    marketCap: 372_000, dilutedShares: 2_405, netDebt: 12_500, beta: 0.56, peers: ["XOM", "JPM", "SAP"]
  },
  {
    symbol: "SAP", name: "SAP", exchange: "XETRA", currency: "EUR", country: "DE", region: "Europe",
    sector: "Technology", industry: "Software", price: 271.24, previousClose: 267.8,
    marketCap: 316_000, dilutedShares: 1_165, netDebt: 4_100, beta: 1.04, peers: ["MSFT", "AAPL", "HSBA"]
  },
  {
    symbol: "HSBA", name: "HSBC", exchange: "LSE", currency: "GBP", country: "GB", region: "Europe",
    sector: "Financials", industry: "Diversified Banks", price: 13.76, previousClose: 13.59,
    marketCap: 168_000, dilutedShares: 12_210, netDebt: 0, beta: 0.92, peers: ["JPM", "SAP", "7203"]
  },
  {
    symbol: "7203", name: "Toyota Motor", exchange: "TSE", currency: "JPY", country: "JP", region: "Asia Pacific",
    sector: "Consumer Discretionary", industry: "Automobiles", price: 18.42, previousClose: 18.19,
    marketCap: 258_000, dilutedShares: 13_990, netDebt: 88_000, beta: 0.71, peers: ["TSLA", "HSBA", "XOM"]
  }
]);

export const fundamentals = Object.freeze({
  AAPL: { revenue: 402_100, revenueGrowth: 6.4, epsGrowth: 9.8, eps: 7.12, pe: 32.6, forwardPe: 29.4, peg: 3.3, evEbitda: 24.8, priceToFcf: 31.2, roic: 48.2, roe: 147.3, grossMargin: 46.8, operatingMargin: 31.9, netMargin: 26.4, debtToEquity: 1.42, freeCashFlow: 112_400, dividendYield: 0.45, payoutRatio: 15.2, momentum12m: 18.4, volatility: 22.1, researchDevelopment: 32_100 },
  MSFT: { revenue: 281_700, revenueGrowth: 14.2, epsGrowth: 15.6, eps: 13.24, pe: 31.6, forwardPe: 27.8, peg: 2.0, evEbitda: 21.4, priceToFcf: 34.7, roic: 29.6, roe: 36.4, grossMargin: 69.4, operatingMargin: 44.6, netMargin: 35.1, debtToEquity: 0.32, freeCashFlow: 78_600, dividendYield: 0.78, payoutRatio: 24.8, momentum12m: 12.1, volatility: 20.4, researchDevelopment: 31_800 },
  NVDA: { revenue: 148_900, revenueGrowth: 62.5, epsGrowth: 74.1, eps: 3.42, pe: 40.4, forwardPe: 28.2, peg: 0.5, evEbitda: 33.6, priceToFcf: 42.9, roic: 71.4, roe: 88.2, grossMargin: 74.6, operatingMargin: 61.2, netMargin: 52.4, debtToEquity: 0.16, freeCashFlow: 68_200, dividendYield: 0.03, payoutRatio: 1.2, momentum12m: 38.7, volatility: 44.8, researchDevelopment: 14_900 },
  TSLA: { revenue: 104_600, revenueGrowth: 4.8, epsGrowth: -12.4, eps: 2.14, pe: 164.3, forwardPe: 112.6, peg: null, evEbitda: 68.4, priceToFcf: 148.2, roic: 8.6, roe: 12.4, grossMargin: 17.9, operatingMargin: 7.2, netMargin: 6.8, debtToEquity: 0.18, freeCashFlow: 7_400, dividendYield: 0, payoutRatio: 0, momentum12m: 24.6, volatility: 52.3, researchDevelopment: 4_600 },
  JPM: { revenue: 176_400, revenueGrowth: 5.1, epsGrowth: 6.8, eps: 18.62, pe: 13.0, forwardPe: 12.4, peg: 1.9, evEbitda: null, priceToFcf: 9.8, roic: null, roe: 17.2, grossMargin: null, operatingMargin: 41.2, netMargin: 29.6, debtToEquity: 1.28, freeCashFlow: 54_200, dividendYield: 2.12, payoutRatio: 27.4, momentum12m: 15.8, volatility: 21.6, researchDevelopment: null },
  XOM: { revenue: 338_200, revenueGrowth: -3.4, epsGrowth: -8.2, eps: 7.84, pe: 14.3, forwardPe: 13.1, peg: null, evEbitda: 6.9, priceToFcf: 12.4, roic: 12.8, roe: 14.6, grossMargin: 29.4, operatingMargin: 12.6, netMargin: 10.1, debtToEquity: 0.21, freeCashFlow: 36_800, dividendYield: 3.48, payoutRatio: 49.8, momentum12m: 4.2, volatility: 24.9, researchDevelopment: 1_100 },
  JNJ: { revenue: 92_400, revenueGrowth: 4.2, epsGrowth: 5.4, eps: 9.86, pe: 15.7, forwardPe: 14.6, peg: 2.9, evEbitda: 12.1, priceToFcf: 16.8, roic: 15.4, roe: 23.1, grossMargin: 68.2, operatingMargin: 26.4, netMargin: 21.8, debtToEquity: 0.46, freeCashFlow: 21_900, dividendYield: 3.21, payoutRatio: 50.4, momentum12m: -2.4, volatility: 15.2, researchDevelopment: 15_100 },
  SAP: { revenue: 38_600, revenueGrowth: 10.4, epsGrowth: 18.2, eps: 6.42, pe: 42.2, forwardPe: 34.1, peg: 2.3, evEbitda: 28.4, priceToFcf: 38.6, roic: 14.2, roe: 16.8, grossMargin: 73.4, operatingMargin: 24.6, netMargin: 18.2, debtToEquity: 0.28, freeCashFlow: 8_200, dividendYield: 0.94, payoutRatio: 38.2, momentum12m: 21.4, volatility: 23.8, researchDevelopment: 7_600 },
  HSBA: { revenue: 66_100, revenueGrowth: 2.6, epsGrowth: 4.1, eps: 1.42, pe: 9.7, forwardPe: 9.1, peg: 2.4, evEbitda: null, priceToFcf: 7.4, roic: null, roe: 13.4, grossMargin: null, operatingMargin: 38.4, netMargin: 26.2, debtToEquity: 1.64, freeCashFlow: 21_400, dividendYield: 6.12, payoutRatio: 52.6, momentum12m: 9.4, volatility: 19.8, researchDevelopment: null },
  7203: { revenue: 312_800, revenueGrowth: 3.1, epsGrowth: 2.4, eps: 2.06, pe: 8.9, forwardPe: 8.4, peg: 3.7, evEbitda: 9.2, priceToFcf: 11.6, roic: 9.4, roe: 12.1, grossMargin: 19.6, operatingMargin: 10.4, netMargin: 9.1, debtToEquity: 1.08, freeCashFlow: 22_600, dividendYield: 2.84, payoutRatio: 27.9, momentum12m: 6.8, volatility: 18.4, researchDevelopment: 9_800 }
});

export const dividends = Object.freeze({
  AAPL: { annualDividend: 1.04, frequency: 4, exDate: "2026-02-06", consecutiveGrowthYears: 13, cagr3y: 4.4, cagr5y: 5.1, cagr10y: 8.2, lastCutYear: null },
  MSFT: { annualDividend: 3.28, frequency: 4, exDate: "2026-02-19", consecutiveGrowthYears: 21, cagr3y: 10.1, cagr5y: 10.4, cagr10y: 11.2, lastCutYear: null },
  NVDA: { annualDividend: 0.04, frequency: 4, exDate: "2026-03-11", consecutiveGrowthYears: 2, cagr3y: 1.2, cagr5y: 0.8, cagr10y: 3.4, lastCutYear: null },
  JPM: { annualDividend: 5.12, frequency: 4, exDate: "2026-01-30", consecutiveGrowthYears: 12, cagr3y: 8.4, cagr5y: 7.1, cagr10y: 9.6, lastCutYear: 2009 },
  XOM: { annualDividend: 3.92, frequency: 4, exDate: "2026-02-12", consecutiveGrowthYears: 24, cagr3y: 3.2, cagr5y: 2.4, cagr10y: 3.1, lastCutYear: null },
  JNJ: { annualDividend: 4.96, frequency: 4, exDate: "2026-02-24", consecutiveGrowthYears: 62, cagr3y: 5.6, cagr5y: 5.8, cagr10y: 6.1, lastCutYear: null },
  SAP: { annualDividend: 2.55, frequency: 1, exDate: "2026-05-14", consecutiveGrowthYears: 6, cagr3y: 6.2, cagr5y: 5.4, cagr10y: 7.4, lastCutYear: 2020 },
  HSBA: { annualDividend: 0.84, frequency: 2, exDate: "2026-03-05", consecutiveGrowthYears: 4, cagr3y: 18.4, cagr5y: 6.2, cagr10y: null, lastCutYear: 2020 },
  7203: { annualDividend: 0.52, frequency: 2, exDate: "2026-03-30", consecutiveGrowthYears: 9, cagr3y: 7.4, cagr5y: 6.6, cagr10y: 8.1, lastCutYear: null }
});

export const earnings = Object.freeze({
  AAPL: {
    nextDate: "2026-01-29",
    impliedMovePercent: 4.2,
    guidance: [{ metric: "Revenue growth", low: 5, high: 7, consensus: 6.1, unit: "%" }],
    kpis: [{ label: "Services revenue growth", value: 12.4, unit: "%" }, { label: "Installed base", value: 2_400, unit: "m devices" }],
    quarters: [
      { period: "Q4 2025", reportDate: "2025-10-30", reportedEps: 2.41, consensusEps: 2.35, reportedRevenue: 124_300, consensusRevenue: 122_800, priceReaction: 2.4 },
      { period: "Q3 2025", reportDate: "2025-07-31", reportedEps: 1.64, consensusEps: 1.6, reportedRevenue: 94_900, consensusRevenue: 94_100, priceReaction: -1.2 },
      { period: "Q2 2025", reportDate: "2025-05-01", reportedEps: 1.58, consensusEps: 1.55, reportedRevenue: 95_400, consensusRevenue: 94_600, priceReaction: 1.1 },
      { period: "Q1 2025", reportDate: "2025-01-30", reportedEps: 2.4, consensusEps: 2.36, reportedRevenue: 119_600, consensusRevenue: 117_900, priceReaction: 3.2 }
    ]
  },
  MSFT: {
    nextDate: "2026-01-27",
    impliedMovePercent: 3.8,
    guidance: [{ metric: "Cloud revenue growth", low: 28, high: 30, consensus: 29.4, unit: "%" }],
    kpis: [{ label: "Azure growth", value: 30.2, unit: "%" }, { label: "Commercial RPO", value: 269_000, unit: "$m" }],
    quarters: [
      { period: "Q2 FY26", reportDate: "2025-10-29", reportedEps: 3.42, consensusEps: 3.31, reportedRevenue: 70_100, consensusRevenue: 69_200, priceReaction: 1.8 },
      { period: "Q1 FY26", reportDate: "2025-07-29", reportedEps: 3.3, consensusEps: 3.1, reportedRevenue: 65_600, consensusRevenue: 64_500, priceReaction: -2.9 },
      { period: "Q4 FY25", reportDate: "2025-04-29", reportedEps: 2.95, consensusEps: 2.93, reportedRevenue: 64_700, consensusRevenue: 64_400, priceReaction: 0.6 },
      { period: "Q3 FY25", reportDate: "2025-01-29", reportedEps: 2.94, consensusEps: 2.82, reportedRevenue: 61_900, consensusRevenue: 61_000, priceReaction: 4.1 }
    ]
  },
  NVDA: {
    nextDate: "2026-02-25",
    impliedMovePercent: 8.6,
    guidance: [{ metric: "Revenue", low: 42_000, high: 44_000, consensus: 43_100, unit: "$m" }],
    kpis: [{ label: "Data centre growth", value: 78.4, unit: "%" }, { label: "Inventory days", value: 104, unit: "days" }],
    quarters: [
      { period: "Q3 FY26", reportDate: "2025-11-19", reportedEps: 0.94, consensusEps: 0.86, reportedRevenue: 39_400, consensusRevenue: 37_800, priceReaction: 5.6 },
      { period: "Q2 FY26", reportDate: "2025-08-27", reportedEps: 0.82, consensusEps: 0.78, reportedRevenue: 34_200, consensusRevenue: 33_100, priceReaction: -3.4 },
      { period: "Q1 FY26", reportDate: "2025-05-28", reportedEps: 0.71, consensusEps: 0.65, reportedRevenue: 30_100, consensusRevenue: 28_900, priceReaction: 7.2 },
      { period: "Q4 FY25", reportDate: "2025-02-26", reportedEps: 0.64, consensusEps: 0.62, reportedRevenue: 26_400, consensusRevenue: 25_800, priceReaction: 1.4 }
    ]
  },
  JPM: {
    nextDate: "2026-01-14",
    impliedMovePercent: null,
    guidance: [{ metric: "Net interest income", low: 91_000, high: 93_000, consensus: 92_400, unit: "$m" }],
    kpis: [{ label: "Net interest margin", value: 2.62, unit: "%" }, { label: "Credit loss provision", value: 3_100, unit: "$m" }],
    quarters: [
      { period: "Q4 2025", reportDate: "2025-10-14", reportedEps: 4.81, consensusEps: 4.62, reportedRevenue: 43_700, consensusRevenue: 42_900, priceReaction: 1.2 },
      { period: "Q3 2025", reportDate: "2025-07-15", reportedEps: 4.37, consensusEps: 4.02, reportedRevenue: 43_300, consensusRevenue: 41_900, priceReaction: 4.4 },
      { period: "Q2 2025", reportDate: "2025-04-11", reportedEps: 4.4, consensusEps: 4.19, reportedRevenue: 42_800, consensusRevenue: 41_600, priceReaction: -0.8 },
      { period: "Q1 2025", reportDate: "2025-01-15", reportedEps: 4.44, consensusEps: 4.11, reportedRevenue: 41_900, consensusRevenue: 41_200, priceReaction: 2.1 }
    ]
  }
});

export const marketShare = Object.freeze({
  NVDA: [
    { year: 2023, share: 78.4 },
    { year: 2024, share: 84.1 },
    { year: 2025, share: 86.2 }
  ],
  MSFT: [
    { year: 2023, share: 23.1 },
    { year: 2024, share: 24.4 },
    { year: 2025, share: 25.6 }
  ]
});

export const macroSeries = Object.freeze({
  policyRate: { label: "Policy rate", unit: "%", observations: [["2025-07-01", 4.5], ["2025-09-01", 4.25], ["2025-11-01", 4], ["2026-01-01", 3.75]] },
  yield10y: { label: "10-year yield", unit: "%", observations: [["2025-07-01", 4.28], ["2025-09-01", 4.12], ["2025-11-01", 4.34], ["2026-01-01", 4.18]] },
  yield2y: { label: "2-year yield", unit: "%", observations: [["2025-07-01", 4.42], ["2025-09-01", 4.06], ["2025-11-01", 3.94], ["2026-01-01", 3.82]] },
  inflation: { label: "CPI inflation", unit: "%", observations: [["2025-07-01", 3.1], ["2025-09-01", 2.9], ["2025-11-01", 2.7], ["2026-01-01", 2.5]] },
  gdp: { label: "GDP growth", unit: "%", observations: [["2025-07-01", 2.4], ["2025-09-01", 2.1], ["2025-11-01", 1.9], ["2026-01-01", 1.8]] },
  unemployment: { label: "Unemployment", unit: "%", observations: [["2025-07-01", 4.1], ["2025-09-01", 4.2], ["2025-11-01", 4.3], ["2026-01-01", 4.4]] },
  payrolls: { label: "Non-farm payrolls", unit: "k", observations: [["2025-07-01", 142], ["2025-09-01", 118], ["2025-11-01", 96], ["2026-01-01", 88]] },
  consumerSpending: { label: "Consumer spending", unit: "%", observations: [["2025-07-01", 2.8], ["2025-09-01", 2.5], ["2025-11-01", 2.2], ["2026-01-01", 2.1]] },
  pmiManufacturing: { label: "Manufacturing PMI", unit: "index", observations: [["2025-07-01", 49.2], ["2025-09-01", 48.6], ["2025-11-01", 49.8], ["2026-01-01", 50.4]] },
  pmiServices: { label: "Services PMI", unit: "index", observations: [["2025-07-01", 53.4], ["2025-09-01", 52.8], ["2025-11-01", 52.1], ["2026-01-01", 51.6]] },
  creditSpreads: { label: "High-yield credit spread", unit: "bp", observations: [["2025-07-01", 312], ["2025-09-01", 298], ["2025-11-01", 341], ["2026-01-01", 326]] },
  dollarIndex: { label: "Dollar index", unit: "index", observations: [["2025-07-01", 104.2], ["2025-09-01", 102.8], ["2025-11-01", 105.6], ["2026-01-01", 103.9]] },
  oil: { label: "Brent crude", unit: "$/bbl", observations: [["2025-07-01", 82.4], ["2025-09-01", 76.1], ["2025-11-01", 71.8], ["2026-01-01", 74.6]] },
  equityIndex: { label: "S&P 500", unit: "index", observations: [["2025-07-01", 6_120], ["2025-09-01", 6_244], ["2025-11-01", 6_318], ["2026-01-01", 6_481]] }
});

export const macroCalendar = Object.freeze([
  { date: "2026-01-13", event: "CPI report", region: "US" },
  { date: "2026-01-28", event: "Central bank rate decision", region: "US" },
  { date: "2026-02-06", event: "Non-farm payrolls", region: "US" },
  { date: "2026-02-12", event: "CPI report", region: "US" }
]);

export const macroReleases = Object.freeze([
  { date: "2025-07-15", event: "CPI report", region: "US" },
  { date: "2025-08-12", event: "CPI report", region: "US" },
  { date: "2025-09-17", event: "Central bank rate decision", region: "US" },
  { date: "2025-10-14", event: "CPI report", region: "US" },
  { date: "2025-11-07", event: "Non-farm payrolls", region: "US" },
  { date: "2025-12-10", event: "Central bank rate decision", region: "US" }
]);

export function securityBySymbol(symbol) {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  return securities.find((security) => security.symbol === normalized) ?? null;
}

function seedFor(symbol) {
  let seed = 7;
  for (const character of String(symbol)) seed = (seed * 31 + character.charCodeAt(0)) % 2_147_483_647;
  return seed || 7;
}

function nextRandom(state) {
  const next = (state * 48_271) % 2_147_483_647;
  return [next, next / 2_147_483_647];
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function priceHistory(symbol, { bars = 504, endDate = DATA_AS_OF } = {}) {
  const security = securityBySymbol(symbol);
  if (!security || !Number.isInteger(bars) || bars < 2) return [];
  const annualVolatility = (fundamentals[security.symbol]?.volatility ?? 20) / 100;
  const dailyVolatility = annualVolatility / Math.sqrt(252);
  const drift = (fundamentals[security.symbol]?.momentum12m ?? 0) / 100 / 252;
  let state = seedFor(security.symbol);
  const closes = [security.price];
  for (let index = 1; index < bars; index += 1) {
    const [first, sampleA] = nextRandom(state);
    const [second, sampleB] = nextRandom(first);
    state = second;
    const shock = (sampleA + sampleB - 1) * dailyVolatility * 2;
    closes.push(Math.max(0.01, closes.at(-1) / (1 + drift + shock)));
  }
  closes.reverse();
  const end = new Date(Date.parse(endDate));
  const history = [];
  let cursor = addDays(end, -(bars - 1) * 1.4);
  for (const close of closes) {
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor = addDays(cursor, 1);
    const [next, sample] = nextRandom(state);
    state = next;
    const range = close * dailyVolatility * (0.6 + sample);
    history.push({
      date: cursor.toISOString().slice(0, 10),
      open: Number((close - range / 3).toFixed(4)),
      high: Number((close + range).toFixed(4)),
      low: Number((close - range).toFixed(4)),
      close: Number(close.toFixed(4)),
      volume: Math.round(1_000_000 + sample * 4_000_000)
    });
    cursor = addDays(cursor, 1);
  }
  return history;
}

export function metricRecord(symbol, field) {
  const security = securityBySymbol(symbol);
  const value = security ? fundamentals[security.symbol]?.[field] : undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return missing(field, "not reported by the data provider", { provider: DATA_PROVIDER, source: DATA_SOURCE });
  }
  return sourced(value, meta(field, security.currency));
}

export function priceRecord(symbol) {
  const security = securityBySymbol(symbol);
  if (!security) return missing("price", "unknown security", { provider: DATA_PROVIDER, source: DATA_SOURCE });
  return sourced(security.price, meta("price", security.currency));
}
