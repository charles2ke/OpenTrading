import { dividends, fundamentals, securityBySymbol } from "./dataset.js";
import { missing } from "./provenance.js";

export function dividendProfile(symbol) {
  const security = securityBySymbol(symbol);
  if (!security) return { valid: false, errors: ["Unknown security."] };
  const record = dividends[security.symbol];
  const metrics = fundamentals[security.symbol];
  if (!record || !metrics.dividendYield) {
    return { valid: false, errors: ["This security does not currently pay a dividend."], unavailable: [missing("dividend", "no dividend paid")] };
  }
  const fcfPayoutRatio = metrics.freeCashFlow > 0
    ? ((record.annualDividend * security.dilutedShares) / metrics.freeCashFlow) * 100
    : null;
  return {
    valid: true,
    errors: [],
    symbol: security.symbol,
    name: security.name,
    currency: security.currency,
    price: security.price,
    yieldPercent: metrics.dividendYield,
    annualDividend: record.annualDividend,
    frequency: record.frequency,
    exDate: record.exDate,
    payoutRatioPercent: metrics.payoutRatio,
    fcfPayoutRatioPercent: fcfPayoutRatio,
    consecutiveGrowthYears: record.consecutiveGrowthYears,
    cagr: { threeYear: record.cagr3y, fiveYear: record.cagr5y, tenYear: record.cagr10y },
    lastCutYear: record.lastCutYear,
    balanceSheet: { debtToEquity: metrics.debtToEquity, freeCashFlow: metrics.freeCashFlow },
    safety: dividendSafety({ record, metrics, fcfPayoutRatio })
  };
}

export function dividendSafety({ record, metrics, fcfPayoutRatio }) {
  const factors = [
    { factor: "Earnings payout ratio", value: metrics.payoutRatio, points: metrics.payoutRatio <= 40 ? 2 : metrics.payoutRatio <= 65 ? 1 : 0 },
    { factor: "Free-cash-flow payout ratio", value: fcfPayoutRatio, points: fcfPayoutRatio === null ? 0 : fcfPayoutRatio <= 50 ? 2 : fcfPayoutRatio <= 80 ? 1 : 0 },
    { factor: "Balance-sheet leverage", value: metrics.debtToEquity, points: metrics.debtToEquity <= 0.6 ? 2 : metrics.debtToEquity <= 1.3 ? 1 : 0 },
    { factor: "Consecutive growth years", value: record.consecutiveGrowthYears, points: record.consecutiveGrowthYears >= 10 ? 2 : record.consecutiveGrowthYears >= 5 ? 1 : 0 },
    { factor: "Dividend cut history", value: record.lastCutYear, points: record.lastCutYear === null ? 2 : 0 }
  ];
  const score = factors.reduce((total, item) => total + item.points, 0);
  return {
    score,
    maximum: factors.length * 2,
    rating: score >= 8 ? "resilient" : score >= 5 ? "adequate" : "fragile",
    factors
  };
}

export function analyzeDividendPortfolio(holdings) {
  const positions = [];
  const unavailable = [];
  for (const holding of holdings ?? []) {
    const profile = dividendProfile(holding?.symbol);
    const security = securityBySymbol(holding?.symbol);
    const value = security && Number.isFinite(holding.quantity) ? holding.quantity * security.price : holding?.value;
    if (!profile.valid || !Number.isFinite(value) || value <= 0) {
      unavailable.push(String(holding?.symbol ?? "").toUpperCase());
      continue;
    }
    positions.push({ ...profile, value, annualIncome: (value * profile.yieldPercent) / 100 });
  }
  const totalValue = positions.reduce((total, position) => total + position.value, 0);
  const annualIncome = positions.reduce((total, position) => total + position.annualIncome, 0);
  const sectors = new Map();
  for (const position of positions) {
    const sector = securityBySymbol(position.symbol).sector;
    sectors.set(sector, (sectors.get(sector) ?? 0) + position.value);
  }
  return {
    valid: positions.length > 0,
    errors: positions.length > 0 ? [] : ["Add at least one dividend-paying holding."],
    positions,
    unavailable,
    totalValue,
    weightedYieldPercent: totalValue === 0 ? 0 : (annualIncome / totalValue) * 100,
    annualIncome,
    quarterlyIncome: annualIncome / 4,
    monthlyIncome: annualIncome / 12,
    sectorDiversification: [...sectors.entries()]
      .map(([name, value]) => ({ name, weightPercent: totalValue === 0 ? 0 : (value / totalValue) * 100 }))
      .sort((left, right) => right.weightPercent - left.weightPercent),
    incomeConcentrationPercent: annualIncome === 0
      ? 0
      : (Math.max(...positions.map((position) => position.annualIncome)) / annualIncome) * 100
  };
}

export function simulateDrip({
  initialInvestment,
  annualContribution = 0,
  startingYieldPercent,
  dividendGrowthPercent = 0,
  priceGrowthPercent = 0,
  reinvest = true,
  years = 10
}) {
  if (![initialInvestment, startingYieldPercent].every((value) => Number.isFinite(value) && value >= 0) || initialInvestment <= 0) {
    return { valid: false, errors: ["Provide a positive initial investment and a starting yield."] };
  }
  if (!Number.isInteger(years) || years < 1 || years > 50) return { valid: false, errors: ["Choose a projection horizon between 1 and 50 years."] };
  let value = initialInvestment;
  let yieldOnCost = startingYieldPercent / 100;
  let cashIncome = 0;
  const rows = [];
  for (let year = 1; year <= years; year += 1) {
    const income = value * yieldOnCost;
    value = value * (1 + priceGrowthPercent / 100) + annualContribution + (reinvest ? income : 0);
    if (!reinvest) cashIncome += income;
    yieldOnCost *= 1 + dividendGrowthPercent / 100;
    rows.push({ year, income, value, cumulativeCashIncome: cashIncome, yieldOnCostPercent: yieldOnCost * 100 });
  }
  return {
    valid: true,
    errors: [],
    reinvest,
    rows,
    finalValue: value,
    totalIncome: rows.reduce((total, row) => total + row.income, 0),
    milestones: rows.filter((row) => [5, 10, 20].includes(row.year)),
    basis: "projection from user assumptions, not a forecast"
  };
}
