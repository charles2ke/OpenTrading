import { macroCalendar, macroSeries, securityBySymbol } from "./dataset.js";

export const MACRO_SCENARIOS = Object.freeze([
  { id: "higher-for-longer", label: "Higher-for-longer rates", factors: { rates: 1, inflation: 0.5, growth: -0.5, dollar: 1 } },
  { id: "rate-cuts", label: "Rate-cut cycle", factors: { rates: -1.5, inflation: -0.3, growth: 0.5, dollar: -0.5 } },
  { id: "inflation-resurgence", label: "Inflation resurgence", factors: { rates: 1.5, inflation: 2, growth: -0.8, dollar: 0.5 } },
  { id: "recession", label: "Recession", factors: { rates: -1, inflation: -1, growth: -2.5, dollar: 0.8 } },
  { id: "soft-landing", label: "Soft landing", factors: { rates: -0.5, inflation: -0.5, growth: 0.8, dollar: -0.2 } },
  { id: "dollar-strength", label: "Dollar strengthening", factors: { rates: 0.5, inflation: -0.2, growth: -0.3, dollar: 2 } },
  { id: "commodity-shock", label: "Commodity shock", factors: { rates: 0.8, inflation: 1.8, growth: -1.2, dollar: 0.4 } }
]);

export const SECTOR_FACTOR_SENSITIVITY = Object.freeze({
  Technology: { rates: -2.4, inflation: -1.2, growth: 1.8, dollar: -0.8 },
  Financials: { rates: 1.6, inflation: -0.4, growth: 1.2, dollar: 0.2 },
  Energy: { rates: 0.4, inflation: 2.2, growth: 0.9, dollar: -1.1 },
  "Health Care": { rates: -0.6, inflation: -0.5, growth: 0.4, dollar: -0.3 },
  "Consumer Discretionary": { rates: -1.8, inflation: -1.6, growth: 2.1, dollar: -0.5 }
});

const MECHANISMS = Object.freeze({
  rates: "Discount rates and financing costs reprice future cash flows.",
  inflation: "Input costs and pricing power change real margins.",
  growth: "Demand and volumes track the economic cycle.",
  dollar: "Reported revenue and competitiveness shift with currency moves."
});

function change(observations, periods) {
  if (observations.length <= periods) return null;
  return observations.at(-1)[1] - observations.at(-1 - periods)[1];
}

export function macroDashboard() {
  return {
    asOf: macroSeries.policyRate.observations.at(-1)[0],
    series: Object.entries(macroSeries).map(([id, series]) => ({
      id,
      label: series.label,
      unit: series.unit,
      latest: series.observations.at(-1)[1],
      changeOnePeriod: change(series.observations, 1),
      changeThreePeriods: change(series.observations, 3),
      history: series.observations.map(([date, value]) => ({ date, value }))
    })),
    yieldCurveSpread: macroSeries.yield10y.observations.at(-1)[1] - macroSeries.yield2y.observations.at(-1)[1],
    calendar: macroCalendar,
    note: "Observed economic data. Scenario analysis is generated separately and is not a forecast."
  };
}

export function exposureMap(holdings) {
  const rows = [];
  for (const holding of holdings ?? []) {
    const security = securityBySymbol(holding?.symbol);
    if (!security) continue;
    const sensitivity = SECTOR_FACTOR_SENSITIVITY[security.sector];
    if (!sensitivity) continue;
    for (const [factor, value] of Object.entries(sensitivity)) {
      rows.push({
        factor,
        symbol: security.symbol,
        sector: security.sector,
        mechanism: MECHANISMS[factor],
        sensitivity: value,
        weightPercent: Number.isFinite(holding.weightPercent) ? holding.weightPercent : null
      });
    }
  }
  return rows;
}

export function scenarioImpact(holdings, scenario) {
  const exposures = exposureMap(holdings);
  const positions = new Map();
  for (const exposure of exposures) {
    const shock = scenario.factors[exposure.factor] ?? 0;
    const impact = shock * exposure.sensitivity;
    positions.set(exposure.symbol, (positions.get(exposure.symbol) ?? 0) + impact);
  }
  const contributions = [...positions.entries()].map(([symbol, impactPercent]) => {
    const weight = holdings.find((holding) => String(holding.symbol).toUpperCase() === symbol)?.weightPercent;
    return { symbol, impactPercent, weightPercent: Number.isFinite(weight) ? weight : null };
  });
  const weighted = contributions.every((contribution) => contribution.weightPercent !== null)
    ? contributions.reduce((total, contribution) => total + (contribution.weightPercent / 100) * contribution.impactPercent, 0)
    : null;
  return {
    id: scenario.id,
    label: scenario.label,
    contributions: contributions.sort((left, right) => left.impactPercent - right.impactPercent),
    portfolioImpactPercent: weighted,
    basis: "AI-independent factor model applied to user holdings; an estimate, not a forecast"
  };
}

export function macroAnalysis(holdings) {
  return {
    dashboard: macroDashboard(),
    exposures: exposureMap(holdings),
    scenarios: MACRO_SCENARIOS.map((scenario) => scenarioImpact(holdings, scenario))
  };
}
