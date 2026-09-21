export const DEFAULT_YEARS = 5;

export const DCF_SCENARIOS = Object.freeze({
  base: { label: "Base", revenueGrowthDelta: 0, operatingMarginDelta: 0, waccDelta: 0 },
  bull: { label: "Bull", revenueGrowthDelta: 3, operatingMarginDelta: 2, waccDelta: -0.5 },
  bear: { label: "Bear", revenueGrowthDelta: -3, operatingMarginDelta: -2, waccDelta: 0.5 }
});

const REQUIRED = [
  "revenue", "revenueGrowth", "operatingMargin", "taxRate", "depreciationPercent",
  "capexPercent", "workingCapitalPercent", "wacc", "terminalGrowth", "netDebt", "dilutedShares"
];

function percent(value) {
  return value / 100;
}

export function validateAssumptions(assumptions = {}) {
  const errors = [];
  for (const field of REQUIRED) {
    const value = assumptions[field];
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${field} is required.`);
  }
  if (errors.length > 0) return errors;
  if (assumptions.revenue <= 0) errors.push("revenue must be positive.");
  if (assumptions.dilutedShares <= 0) errors.push("dilutedShares must be positive.");
  if (assumptions.taxRate < 0 || assumptions.taxRate >= 100) errors.push("taxRate must be between 0 and 100.");
  if (assumptions.wacc <= 0) errors.push("wacc must be positive.");
  if (assumptions.wacc <= assumptions.terminalGrowth) errors.push("wacc must exceed terminalGrowth.");
  return errors;
}

export function forecast(assumptions, years = DEFAULT_YEARS) {
  const rows = [];
  let revenue = assumptions.revenue;
  for (let year = 1; year <= years; year += 1) {
    const previousRevenue = revenue;
    revenue = previousRevenue * (1 + percent(assumptions.revenueGrowth));
    const ebit = revenue * percent(assumptions.operatingMargin);
    const taxes = ebit * percent(assumptions.taxRate);
    const nopat = ebit - taxes;
    const depreciation = revenue * percent(assumptions.depreciationPercent);
    const capex = revenue * percent(assumptions.capexPercent);
    const workingCapital = (revenue - previousRevenue) * percent(assumptions.workingCapitalPercent);
    rows.push({
      year,
      revenue,
      ebit,
      taxes,
      nopat,
      depreciation,
      capex,
      workingCapital,
      ebitda: ebit + depreciation,
      freeCashFlow: nopat + depreciation - capex - workingCapital,
      discountFactor: 1 / (1 + percent(assumptions.wacc)) ** year
    });
  }
  return rows;
}

export function terminalValues(assumptions, rows) {
  const last = rows.at(-1);
  const wacc = percent(assumptions.wacc);
  const growth = percent(assumptions.terminalGrowth);
  const perpetuity = (last.freeCashFlow * (1 + growth)) / (wacc - growth);
  const exitMultiple = typeof assumptions.exitMultiple === "number" && Number.isFinite(assumptions.exitMultiple)
    ? last.ebitda * assumptions.exitMultiple
    : null;
  return { perpetuity, exitMultiple };
}

function valuation(assumptions, rows, terminalValue) {
  const discounted = rows.reduce((total, row) => total + row.freeCashFlow * row.discountFactor, 0);
  const enterpriseValue = discounted + terminalValue * rows.at(-1).discountFactor;
  const equityValue = enterpriseValue - assumptions.netDebt;
  const valuePerShare = equityValue / assumptions.dilutedShares;
  const currentPrice = typeof assumptions.currentPrice === "number" && assumptions.currentPrice > 0 ? assumptions.currentPrice : null;
  return {
    presentValueOfForecast: discounted,
    terminalValue,
    enterpriseValue,
    equityValue,
    valuePerShare,
    currentPrice,
    upsidePercent: currentPrice === null ? null : (valuePerShare / currentPrice - 1) * 100
  };
}

export function runDcf(assumptions, years = DEFAULT_YEARS) {
  const errors = validateAssumptions(assumptions);
  if (errors.length > 0) return { valid: false, errors };
  const rows = forecast(assumptions, years);
  const terminal = terminalValues(assumptions, rows);
  return {
    valid: true,
    errors: [],
    assumptions: { ...assumptions },
    forecast: rows,
    perpetuityGrowth: valuation(assumptions, rows, terminal.perpetuity),
    exitMultiple: terminal.exitMultiple === null ? null : valuation(assumptions, rows, terminal.exitMultiple)
  };
}

export function scenarioAssumptions(assumptions, scenario) {
  const preset = DCF_SCENARIOS[scenario] ?? DCF_SCENARIOS.base;
  return {
    ...assumptions,
    revenueGrowth: assumptions.revenueGrowth + preset.revenueGrowthDelta,
    operatingMargin: Math.max(0, assumptions.operatingMargin + preset.operatingMarginDelta),
    wacc: Math.max(0.1, assumptions.wacc + preset.waccDelta)
  };
}

export function runScenarios(assumptions, years = DEFAULT_YEARS) {
  return Object.keys(DCF_SCENARIOS).map((scenario) => ({
    scenario,
    label: DCF_SCENARIOS[scenario].label,
    result: runDcf(scenarioAssumptions(assumptions, scenario), years)
  }));
}

function sensitivity(assumptions, years, rowValues, columnValues, build) {
  return {
    rows: rowValues,
    columns: columnValues,
    values: rowValues.map((rowValue) => columnValues.map((columnValue) => {
      const result = runDcf(build(assumptions, rowValue, columnValue), years);
      return result.valid ? result.perpetuityGrowth.valuePerShare : null;
    }))
  };
}

export function waccTerminalGrowthMatrix(assumptions, waccValues, growthValues, years = DEFAULT_YEARS) {
  return sensitivity(assumptions, years, waccValues, growthValues, (base, wacc, terminalGrowth) => ({ ...base, wacc, terminalGrowth }));
}

export function waccExitMultipleMatrix(assumptions, waccValues, multiples, years = DEFAULT_YEARS) {
  return {
    rows: waccValues,
    columns: multiples,
    values: waccValues.map((wacc) => multiples.map((exitMultiple) => {
      const result = runDcf({ ...assumptions, wacc, exitMultiple }, years);
      return result.valid && result.exitMultiple ? result.exitMultiple.valuePerShare : null;
    }))
  };
}
