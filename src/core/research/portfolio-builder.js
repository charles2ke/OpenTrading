export const ASSET_CLASSES = Object.freeze([
  { id: "domestic-equity", label: "Domestic equities", etf: "VTI", expectedReturn: 7.5, volatility: 16.2, income: 1.3, liquidity: "high" },
  { id: "international-equity", label: "International equities", etf: "VXUS", expectedReturn: 7, volatility: 17.4, income: 2.9, liquidity: "high" },
  { id: "government-bonds", label: "Government bonds", etf: "GOVT", expectedReturn: 3.8, volatility: 5.4, income: 4, liquidity: "high" },
  { id: "corporate-bonds", label: "Corporate bonds", etf: "LQD", expectedReturn: 4.6, volatility: 7.1, income: 4.8, liquidity: "medium" },
  { id: "cash", label: "Cash", etf: "BIL", expectedReturn: 3.2, volatility: 0.6, income: 3.2, liquidity: "high" },
  { id: "reits", label: "REITs", etf: "VNQ", expectedReturn: 6.4, volatility: 19.6, income: 3.8, liquidity: "medium" },
  { id: "commodities", label: "Commodities", etf: "DJP", expectedReturn: 4.2, volatility: 18.1, income: 0, liquidity: "medium" },
  { id: "alternatives", label: "Alternatives", etf: "QAI", expectedReturn: 5.1, volatility: 9.8, income: 1.1, liquidity: "low" }
]);

export const RISK_PROFILES = Object.freeze({
  conservative: { "domestic-equity": 20, "international-equity": 10, "government-bonds": 35, "corporate-bonds": 20, cash: 10, reits: 5, commodities: 0, alternatives: 0 },
  balanced: { "domestic-equity": 35, "international-equity": 18, "government-bonds": 22, "corporate-bonds": 13, cash: 5, reits: 5, commodities: 2, alternatives: 0 },
  growth: { "domestic-equity": 48, "international-equity": 22, "government-bonds": 12, "corporate-bonds": 8, cash: 3, reits: 4, commodities: 3, alternatives: 0 },
  aggressive: { "domestic-equity": 58, "international-equity": 26, "government-bonds": 4, "corporate-bonds": 3, cash: 2, reits: 3, commodities: 2, alternatives: 2 }
});

export const BENCHMARKS = Object.freeze({
  conservative: "30% global equities / 70% bonds",
  balanced: "60% global equities / 40% bonds",
  growth: "80% global equities / 20% bonds",
  aggressive: "100% global equities"
});

const AVERAGE_CORRELATION = 0.35;

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return weights;
  return Object.fromEntries(Object.entries(weights).map(([id, weight]) => [id, (weight / total) * 100]));
}

export function targetAllocation(profile = {}) {
  const risk = RISK_PROFILES[profile.riskTolerance] ? profile.riskTolerance : "balanced";
  const weights = { ...RISK_PROFILES[risk] };
  const horizon = Number.isFinite(profile.horizonYears) ? profile.horizonYears : 10;
  if (horizon < 5) {
    weights["domestic-equity"] = Math.max(0, weights["domestic-equity"] - 10);
    weights["international-equity"] = Math.max(0, weights["international-equity"] - 5);
    weights["government-bonds"] += 10;
    weights.cash += 5;
  }
  const liquidity = Number.isFinite(profile.liquidityRequirementPercent) ? profile.liquidityRequirementPercent : 0;
  if (liquidity > weights.cash) {
    const shortfall = liquidity - weights.cash;
    weights.cash = liquidity;
    weights["domestic-equity"] = Math.max(0, weights["domestic-equity"] - shortfall);
  }
  if (Number.isFinite(profile.incomeRequirementPercent) && profile.incomeRequirementPercent >= 3) {
    weights["corporate-bonds"] += 5;
    weights.reits += 3;
    weights["domestic-equity"] = Math.max(0, weights["domestic-equity"] - 8);
  }
  return normalizeWeights(weights);
}

export function coreSatellite(weights, satellitePercent = 20) {
  const satellite = Math.min(40, Math.max(0, satellitePercent));
  const coreShare = (100 - satellite) / 100;
  return {
    core: Object.entries(weights).map(([id, weight]) => ({ id, weightPercent: weight * coreShare })),
    satellite: { weightPercent: satellite, purpose: "Higher-conviction single securities or thematic exposure." }
  };
}

export function portfolioStatistics(weights) {
  const entries = Object.entries(weights).map(([id, weight]) => ({
    asset: ASSET_CLASSES.find((assetClass) => assetClass.id === id),
    weight: weight / 100
  })).filter((entry) => entry.asset);
  const expectedReturn = entries.reduce((total, entry) => total + entry.weight * entry.asset.expectedReturn, 0);
  const income = entries.reduce((total, entry) => total + entry.weight * entry.asset.income, 0);
  const variance = entries.reduce((total, entry) => {
    const own = (entry.weight * entry.asset.volatility) ** 2;
    const cross = entries
      .filter((other) => other.asset.id !== entry.asset.id)
      .reduce((sum, other) => sum + entry.weight * other.weight * entry.asset.volatility * other.asset.volatility * AVERAGE_CORRELATION, 0);
    return total + own + cross;
  }, 0);
  const volatility = Math.sqrt(variance);
  return {
    expectedReturnPercent: expectedReturn,
    volatilityPercent: volatility,
    incomeYieldPercent: income,
    sharpeRatio: volatility === 0 ? null : (expectedReturn - 3.2) / volatility
  };
}

export function rebalancePlan(weights, existingHoldings = [], investmentAmount = 0) {
  const currentValue = existingHoldings.reduce((total, holding) => total + (Number.isFinite(holding.value) ? holding.value : 0), 0);
  const totalValue = currentValue + investmentAmount;
  return Object.entries(weights).map(([id, weight]) => {
    const current = existingHoldings
      .filter((holding) => holding.assetClass === id)
      .reduce((total, holding) => total + (Number.isFinite(holding.value) ? holding.value : 0), 0);
    const target = (weight / 100) * totalValue;
    return {
      id,
      label: ASSET_CLASSES.find((assetClass) => assetClass.id === id)?.label ?? id,
      etf: ASSET_CLASSES.find((assetClass) => assetClass.id === id)?.etf ?? null,
      targetPercent: weight,
      currentPercent: totalValue === 0 ? 0 : (current / totalValue) * 100,
      currentValue: current,
      targetValue: target,
      tradeValue: target - current
    };
  });
}

export function contributionPlan(weights, contribution = 0) {
  return Object.entries(weights).map(([id, weight]) => ({ id, weightPercent: weight, amount: (weight / 100) * contribution }));
}

export function taxGuidance(profile = {}) {
  const notes = [
    "General information only — this is not personalised tax advice.",
    "Consider holding income-producing assets in tax-advantaged accounts where your rules allow it."
  ];
  if (profile.accountType === "taxable") notes.push("In a taxable account, frequent rebalancing can realise gains; consider rebalancing with new contributions first.");
  if (profile.accountType === "tax-advantaged") notes.push("Tax-advantaged accounts usually let you rebalance without an immediate tax event.");
  return notes;
}

export function buildPortfolio(profile = {}) {
  const investmentAmount = Number.isFinite(profile.investmentAmount) ? profile.investmentAmount : 0;
  if (investmentAmount <= 0) return { valid: false, errors: ["Enter an investment amount greater than zero."] };
  const weights = targetAllocation(profile);
  return {
    valid: true,
    errors: [],
    profile,
    benchmark: BENCHMARKS[RISK_PROFILES[profile.riskTolerance] ? profile.riskTolerance : "balanced"],
    weights,
    allocation: rebalancePlan(weights, profile.existingHoldings ?? [], investmentAmount),
    coreSatellite: coreSatellite(weights, profile.satellitePercent ?? 20),
    statistics: portfolioStatistics(weights),
    contributions: contributionPlan(weights, profile.monthlyContribution ?? 0),
    rebalancingRules: [
      "Review the allocation quarterly.",
      "Rebalance when an asset class drifts more than 5 percentage points from target.",
      "Direct new contributions to the most underweight asset class first."
    ],
    taxNotes: taxGuidance(profile)
  };
}
