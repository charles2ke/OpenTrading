import { priceHistory, securities, securityBySymbol } from "./dataset.js";
import { beta, correlation, maxDrawdown, mean, percentile, simpleReturns, standardDeviation } from "./stats.js";

export const STRESS_SCENARIOS = Object.freeze([
  { id: "equity-decline", label: "Equity market decline (-20%)", marketShock: -20, sectorShocks: {} },
  { id: "recession", label: "Recession", marketShock: -15, sectorShocks: { "Consumer Discretionary": -8, Financials: -6, Energy: -5, "Health Care": 4 } },
  { id: "rate-increase", label: "Rates +200bp", marketShock: -8, sectorShocks: { Technology: -5, Financials: 4, "Real Estate": -7 } },
  { id: "rate-decrease", label: "Rates -200bp", marketShock: 6, sectorShocks: { Technology: 4, Financials: -3, "Real Estate": 6 } },
  { id: "usd-appreciation", label: "USD appreciation", marketShock: -3, sectorShocks: {}, foreignCurrencyShock: -6 },
  { id: "usd-depreciation", label: "USD depreciation", marketShock: 2, sectorShocks: {}, foreignCurrencyShock: 6 },
  { id: "tech-selloff", label: "Technology selloff", marketShock: -6, sectorShocks: { Technology: -18 } },
  { id: "inflation-shock", label: "Inflation shock", marketShock: -10, sectorShocks: { Energy: 12, Technology: -6, "Consumer Discretionary": -6 } }
]);

const RATE_SENSITIVITY = Object.freeze({
  Financials: 0.6,
  "Real Estate": -0.9,
  Technology: -0.5,
  Utilities: -0.7,
  Energy: 0.1,
  "Health Care": -0.2,
  "Consumer Discretionary": -0.4
});

export function normalizeHoldings(holdings, totalValue = null) {
  const resolved = [];
  for (const holding of holdings ?? []) {
    const security = securityBySymbol(holding?.symbol);
    if (!security) continue;
    let value = null;
    if (Number.isFinite(holding.value)) value = holding.value;
    else if (Number.isFinite(holding.quantity)) value = holding.quantity * security.price;
    else if (Number.isFinite(holding.weightPercent) && Number.isFinite(totalValue)) value = (holding.weightPercent / 100) * totalValue;
    if (value === null || value <= 0) continue;
    resolved.push({
      symbol: security.symbol,
      name: security.name,
      sector: security.sector,
      region: security.region,
      currency: security.currency,
      beta: security.beta,
      value
    });
  }
  const total = resolved.reduce((sum, position) => sum + position.value, 0);
  return resolved.map((position) => ({ ...position, weight: total === 0 ? 0 : position.value / total }));
}

function group(positions, key) {
  const totals = new Map();
  for (const position of positions) {
    totals.set(position[key], (totals.get(position[key]) ?? 0) + position.weight);
  }
  return [...totals.entries()]
    .map(([name, weight]) => ({ name, weightPercent: weight * 100 }))
    .sort((left, right) => right.weightPercent - left.weightPercent);
}

export function concentration(positions) {
  const sorted = [...positions].sort((left, right) => right.weight - left.weight);
  return {
    positions: sorted.map((position) => ({ symbol: position.symbol, weightPercent: position.weight * 100 })),
    largestPositionPercent: sorted.length === 0 ? 0 : sorted[0].weight * 100,
    topFivePercent: sorted.slice(0, 5).reduce((total, position) => total + position.weight, 0) * 100,
    herfindahl: sorted.reduce((total, position) => total + position.weight ** 2, 0),
    bySector: group(positions, "sector"),
    byRegion: group(positions, "region"),
    byCurrency: group(positions, "currency")
  };
}

function returnsBySymbol(symbols, bars) {
  const map = new Map();
  for (const symbol of symbols) {
    map.set(symbol, simpleReturns(priceHistory(symbol, { bars }).map((bar) => bar.close)));
  }
  return map;
}

export function correlationMatrix(symbols, bars = 252) {
  const returns = returnsBySymbol(symbols, bars);
  return {
    symbols: [...symbols],
    values: symbols.map((row) => symbols.map((column) =>
      row === column ? 1 : correlation(returns.get(row), returns.get(column))))
  };
}

export function benchmarkReturns(bars = 252) {
  const series = securities.map((security) => simpleReturns(priceHistory(security.symbol, { bars }).map((bar) => bar.close)));
  const length = Math.min(...series.map((values) => values.length));
  const averaged = [];
  for (let index = 0; index < length; index += 1) {
    averaged.push(mean(series.map((values) => values[index])));
  }
  return averaged;
}

export function portfolioReturns(positions, bars = 252) {
  const returns = returnsBySymbol(positions.map((position) => position.symbol), bars);
  const length = Math.min(...positions.map((position) => returns.get(position.symbol).length));
  const combined = [];
  for (let index = 0; index < length; index += 1) {
    combined.push(positions.reduce((total, position) => total + position.weight * returns.get(position.symbol)[index], 0));
  }
  return combined;
}

export function liquidity(positions, bars = 60) {
  return positions.map((position) => {
    const history = priceHistory(position.symbol, { bars });
    const dailyValue = mean(history.map((bar) => bar.close * bar.volume));
    return {
      symbol: position.symbol,
      averageDailyValue: dailyValue,
      daysToLiquidate: dailyValue ? position.value / (dailyValue * 0.1) : null
    };
  });
}

export function interestRateSensitivity(positions) {
  const contributions = positions
    .map((position) => ({
      symbol: position.symbol,
      sector: position.sector,
      sensitivity: RATE_SENSITIVITY[position.sector] ?? 0,
      weightPercent: position.weight * 100
    }))
    .filter((position) => position.sensitivity !== 0);
  return {
    contributions,
    portfolioSensitivity: contributions.reduce((total, position) => total + (position.weightPercent / 100) * position.sensitivity, 0)
  };
}

export function stressTest(positions, scenario) {
  const impacts = positions.map((position) => {
    const sectorShock = scenario.sectorShocks?.[position.sector] ?? 0;
    const currencyShock = position.currency === "USD" ? 0 : scenario.foreignCurrencyShock ?? 0;
    const impactPercent = scenario.marketShock * position.beta + sectorShock + currencyShock;
    return { symbol: position.symbol, impactPercent, contributionPercent: impactPercent * position.weight };
  });
  return {
    id: scenario.id,
    label: scenario.label,
    estimatedImpactPercent: impacts.reduce((total, impact) => total + impact.contributionPercent, 0),
    positions: impacts.sort((left, right) => left.contributionPercent - right.contributionPercent),
    basis: "scenario estimate, not a forecast"
  };
}

function severity(value, thresholds) {
  if (value >= thresholds[1]) return "high";
  if (value >= thresholds[0]) return "medium";
  return "low";
}

export function riskHeatMap(analysis) {
  const { concentration: focus, metrics, interestRate } = analysis;
  const topSector = focus.bySector[0] ?? { name: "n/a", weightPercent: 0 };
  return [
    {
      risk: "Position concentration",
      exposure: `${focus.largestPositionPercent.toFixed(1)}% largest holding`,
      severity: severity(focus.largestPositionPercent, [15, 25]),
      contributors: focus.positions.slice(0, 3).map((position) => position.symbol),
      mitigation: "Trim the largest position or add uncorrelated holdings."
    },
    {
      risk: "Sector concentration",
      exposure: `${topSector.weightPercent.toFixed(1)}% ${topSector.name}`,
      severity: severity(topSector.weightPercent, [30, 45]),
      contributors: focus.bySector.slice(0, 2).map((sector) => sector.name),
      mitigation: "Diversify across sectors with different demand drivers."
    },
    {
      risk: "Volatility",
      exposure: `${(metrics.annualizedVolatilityPercent ?? 0).toFixed(1)}% annualized`,
      severity: severity(metrics.annualizedVolatilityPercent ?? 0, [18, 28]),
      contributors: focus.positions.slice(0, 3).map((position) => position.symbol),
      mitigation: "Increase defensive or fixed-income exposure."
    },
    {
      risk: "Interest-rate sensitivity",
      exposure: `${interestRate.portfolioSensitivity.toFixed(2)} factor beta`,
      severity: severity(Math.abs(interestRate.portfolioSensitivity), [0.2, 0.45]),
      contributors: interestRate.contributions.slice(0, 3).map((position) => position.symbol),
      mitigation: "Balance rate-sensitive sectors against rate beneficiaries."
    }
  ];
}

export function analyzePortfolioRisk(holdings, { totalValue = null, bars = 252 } = {}) {
  const positions = normalizeHoldings(holdings, totalValue);
  if (positions.length === 0) return { valid: false, errors: ["Add at least one recognised holding."] };
  const returns = portfolioReturns(positions, bars);
  const deviation = standardDeviation(returns);
  const closes = returns.reduce((series, value) => [...series, series.at(-1) * (1 + value)], [1]);
  const varLevel = percentile(returns, 0.05);
  const tail = returns.filter((value) => value <= varLevel);
  const metrics = {
    observations: returns.length,
    annualizedVolatilityPercent: deviation === null ? null : deviation * Math.sqrt(252) * 100,
    beta: beta(returns, benchmarkReturns(bars)),
    weightedBeta: positions.reduce((total, position) => total + position.weight * position.beta, 0),
    maxDrawdownPercent: maxDrawdown(closes) * 100,
    valueAtRisk95Percent: varLevel * 100,
    expectedShortfall95Percent: mean(tail) * 100
  };
  const analysis = {
    valid: true,
    errors: [],
    totalValue: positions.reduce((total, position) => total + position.value, 0),
    positions,
    concentration: concentration(positions),
    correlations: correlationMatrix(positions.map((position) => position.symbol), bars),
    metrics,
    liquidity: liquidity(positions),
    interestRate: interestRateSensitivity(positions),
    scenarios: STRESS_SCENARIOS.map((scenario) => stressTest(positions, scenario))
  };
  return { ...analysis, heatMap: riskHeatMap(analysis) };
}
