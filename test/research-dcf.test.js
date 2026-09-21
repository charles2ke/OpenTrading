import assert from "node:assert/strict";
import test from "node:test";
import {
  DCF_SCENARIOS,
  forecast,
  runDcf,
  runScenarios,
  scenarioAssumptions,
  terminalValues,
  validateAssumptions,
  waccExitMultipleMatrix,
  waccTerminalGrowthMatrix
} from "../src/core/research/dcf.js";

function assumptions(overrides = {}) {
  return {
    revenue: 1000,
    revenueGrowth: 10,
    operatingMargin: 20,
    taxRate: 25,
    depreciationPercent: 5,
    capexPercent: 6,
    workingCapitalPercent: 2,
    wacc: 10,
    terminalGrowth: 2,
    exitMultiple: 12,
    netDebt: 200,
    dilutedShares: 100,
    currentPrice: 40,
    ...overrides
  };
}

test("rejects incomplete or inconsistent assumptions", () => {
  assert.deepEqual(validateAssumptions({}).length, 11);
  assert.deepEqual(validateAssumptions(assumptions({ revenue: "1000" })), ["revenue is required."]);
  assert.deepEqual(validateAssumptions(assumptions({ revenue: 0 })), ["revenue must be positive."]);
  assert.deepEqual(validateAssumptions(assumptions({ dilutedShares: -1 })), ["dilutedShares must be positive."]);
  assert.deepEqual(validateAssumptions(assumptions({ taxRate: 100 })), ["taxRate must be between 0 and 100."]);
  assert.deepEqual(validateAssumptions(assumptions({ taxRate: -1 })), ["taxRate must be between 0 and 100."]);
  assert.deepEqual(validateAssumptions(assumptions({ wacc: -2 })), ["wacc must be positive.", "wacc must exceed terminalGrowth."]);
  assert.deepEqual(validateAssumptions(assumptions({ terminalGrowth: 10 })), ["wacc must exceed terminalGrowth."]);
  assert.deepEqual(validateAssumptions(assumptions()), []);
  assert.deepEqual(runDcf({ revenue: 10 }), { valid: false, errors: validateAssumptions({ revenue: 10 }) });
});

test("builds a five-year unlevered free-cash-flow forecast", () => {
  const rows = forecast(assumptions());
  assert.equal(rows.length, 5);
  const [first] = rows;
  assert.equal(first.revenue, 1100);
  assert.equal(first.ebit, 220);
  assert.equal(first.taxes, 55);
  assert.equal(first.nopat, 165);
  assert.equal(first.depreciation, 55);
  assert.equal(first.capex, 66);
  assert.equal(first.workingCapital, 2);
  assert.equal(first.ebitda, 275);
  assert.equal(first.freeCashFlow, 152);
  assert.equal(first.discountFactor, 1 / 1.1);
  assert.ok(Math.abs(rows.at(-1).revenue - 1000 * 1.1 ** 5) < 1e-9);
});

test("values the terminal period with both methods", () => {
  const rows = forecast(assumptions());
  const terminal = terminalValues(assumptions(), rows);
  assert.equal(terminal.perpetuity, (rows.at(-1).freeCashFlow * 1.02) / (0.1 - 0.02));
  assert.equal(terminal.exitMultiple, rows.at(-1).ebitda * 12);
  assert.equal(terminalValues(assumptions({ exitMultiple: null }), rows).exitMultiple, null);
});

test("derives enterprise, equity and per-share values with an upside comparison", () => {
  const result = runDcf(assumptions());
  assert.equal(result.valid, true);
  const { perpetuityGrowth } = result;
  assert.equal(
    perpetuityGrowth.enterpriseValue,
    perpetuityGrowth.presentValueOfForecast + perpetuityGrowth.terminalValue * result.forecast.at(-1).discountFactor
  );
  assert.equal(perpetuityGrowth.equityValue, perpetuityGrowth.enterpriseValue - 200);
  assert.equal(perpetuityGrowth.valuePerShare, perpetuityGrowth.equityValue / 100);
  assert.equal(perpetuityGrowth.currentPrice, 40);
  assert.equal(perpetuityGrowth.upsidePercent, (perpetuityGrowth.valuePerShare / 40 - 1) * 100);
  assert.ok(result.exitMultiple.valuePerShare > 0);
});

test("reports missing price comparisons instead of inventing one", () => {
  const result = runDcf(assumptions({ currentPrice: 0 }));
  assert.equal(result.perpetuityGrowth.currentPrice, null);
  assert.equal(result.perpetuityGrowth.upsidePercent, null);
  assert.equal(runDcf(assumptions({ exitMultiple: "12" })).exitMultiple, null);
});

test("recalculates deterministically for identical assumptions", () => {
  assert.deepEqual(runDcf(assumptions()), runDcf(assumptions()));
  assert.notEqual(runDcf(assumptions()).perpetuityGrowth.valuePerShare, runDcf(assumptions({ wacc: 12 })).perpetuityGrowth.valuePerShare);
});

test("applies bull, base and bear scenario adjustments", () => {
  assert.deepEqual(scenarioAssumptions(assumptions(), "bull"), assumptions({ revenueGrowth: 13, operatingMargin: 22, wacc: 9.5 }));
  assert.deepEqual(scenarioAssumptions(assumptions(), "unknown"), assumptions());
  assert.deepEqual(scenarioAssumptions(assumptions({ operatingMargin: 1, wacc: 0.2 }), "bear"), assumptions({ revenueGrowth: 7, operatingMargin: 0, wacc: 0.7 }));
  const scenarios = runScenarios(assumptions());
  assert.deepEqual(scenarios.map((scenario) => scenario.scenario), Object.keys(DCF_SCENARIOS));
  assert.ok(scenarios[1].result.perpetuityGrowth.valuePerShare > scenarios[0].result.perpetuityGrowth.valuePerShare);
  assert.ok(scenarios[2].result.perpetuityGrowth.valuePerShare < scenarios[0].result.perpetuityGrowth.valuePerShare);
});

test("builds sensitivity matrices and marks impossible combinations", () => {
  const matrix = waccTerminalGrowthMatrix(assumptions(), [8, 10], [2, 12]);
  assert.deepEqual(matrix.rows, [8, 10]);
  assert.deepEqual(matrix.columns, [2, 12]);
  assert.equal(matrix.values[0][1], null);
  assert.equal(matrix.values[1][0], runDcf(assumptions({ wacc: 10, terminalGrowth: 2 })).perpetuityGrowth.valuePerShare);

  const exitMatrix = waccExitMultipleMatrix(assumptions(), [10, 1], [10, 14]);
  assert.equal(exitMatrix.values[0][1], runDcf(assumptions({ wacc: 10, exitMultiple: 14 })).exitMultiple.valuePerShare);
  assert.equal(exitMatrix.values[1][0], null);
  assert.equal(waccExitMultipleMatrix(assumptions(), [10], [null]).values[0][0], null);
});
