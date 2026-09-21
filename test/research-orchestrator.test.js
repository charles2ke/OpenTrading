import assert from "node:assert/strict";
import test from "node:test";
import {
  ORCHESTRATOR_VERSION,
  buildGroundingPacket,
  interpret,
  runResearch
} from "../src/core/research/orchestrator.js";
import { DATA_AS_OF } from "../src/core/research/dataset.js";

test("grounds the model with market data, financials, macro and assumptions", () => {
  const packet = buildGroundingPacket("aapl", { assumptions: { wacc: 8.5 }, calculations: { dcf: { valid: false } } });
  assert.equal(packet.valid, true);
  assert.deepEqual(packet.errors, []);
  assert.equal(packet.security.symbol, "AAPL");
  assert.equal(packet.marketData.price.value, 232.14);
  assert.equal(packet.marketData.price.asOf, DATA_AS_OF);
  assert.equal(packet.financials.revenueGrowth.value, 6.4);
  assert.equal(packet.financials.revenueGrowth.currency, "USD");
  assert.equal(packet.filings.available, false);
  assert.ok(packet.macro.series.length > 0);
  assert.deepEqual(packet.assumptions, { wacc: 8.5 });
  assert.deepEqual(packet.calculatedMetrics, { dcf: { valid: false } });
  assert.ok(packet.instruction.includes("State missing data explicitly"));
});

test("lists fields that the connected sources do not provide", () => {
  assert.deepEqual(buildGroundingPacket("TSLA").unavailable, ["peg"]);
  assert.deepEqual(buildGroundingPacket("AAPL").unavailable, []);
});

test("rejects unknown securities", () => {
  assert.deepEqual(buildGroundingPacket("NOPE"), { valid: false, errors: ["Unknown security."] });
  assert.deepEqual(interpret({ valid: false, errors: ["Unknown security."] }), {
    valid: false,
    errors: ["Unknown security."]
  });
  assert.deepEqual(runResearch("NOPE"), { valid: false, errors: ["Unknown security."] });
});

test("interprets only the supplied calculations", () => {
  const bare = interpret(buildGroundingPacket("TSLA"));
  assert.equal(bare.model, ORCHESTRATOR_VERSION);
  assert.equal(bare.grounding.source.asOf, DATA_AS_OF);
  assert.ok(bare.narrative[0].includes("Tesla (TSLA) trades on NASDAQ"));
  assert.ok(bare.narrative[1].includes("operating margin"));
  assert.ok(bare.narrative.some((line) => line.includes("Not available from the connected data sources: peg")));
  assert.equal(bare.narrative.at(-1), "Filings are not connected in this deployment, so no filing-based conclusions are drawn.");
  assert.equal(bare.narrative.length, 4);

  const skipped = interpret(buildGroundingPacket("AAPL", {
    calculations: { dcf: { valid: false }, technicals: { valid: false }, earnings: { valid: false } }
  }));
  assert.equal(skipped.narrative.length, 3);
});

test("runs the full research pipeline and saves a reproducible report", () => {
  const run = runResearch("AAPL");
  assert.equal(run.valid, true);
  assert.equal(run.symbol, "AAPL");
  assert.equal(run.calculations.dcf.valid, true);
  assert.equal(run.calculations.technicals.valid, true);
  assert.equal(run.calculations.earnings.valid, true);
  assert.equal(run.calculations.competition.valid, true);

  const { narrative } = run.interpretation;
  assert.ok(narrative.some((line) => line.includes("per share against a market price")));
  assert.ok(narrative.some((line) => line.includes("Technical signals are mixed")));
  assert.ok(narrative.some((line) => line.includes("EPS beat rate")));
  assert.ok(narrative.some((line) => line.includes("not a price target")));

  assert.equal(run.report.title, "Apple research note");
  assert.equal(run.report.module, "company-research");
  assert.equal(run.report.modelVersion, ORCHESTRATOR_VERSION);
  assert.equal(run.report.results.valuePerShare, run.calculations.dcf.perpetuityGrowth.valuePerShare);
  assert.equal(run.report.results.beatRate, run.calculations.earnings.beatRate);
  assert.deepEqual(run.report.narrative, narrative);

  const repeat = runResearch("AAPL");
  assert.deepEqual(repeat.report.results, run.report.results);
});

test("accepts custom assumptions and titles, and tolerates missing calculations", () => {
  const base = runResearch("AAPL");
  const custom = runResearch("AAPL", {
    assumptions: { ...base.report.assumptions, wacc: 12 },
    title: "Conservative case"
  });
  assert.equal(custom.report.title, "Conservative case");
  assert.equal(custom.report.assumptions.wacc, 12);
  assert.ok(custom.report.results.valuePerShare < base.report.results.valuePerShare);

  const withoutEarnings = runResearch("XOM");
  assert.equal(withoutEarnings.calculations.earnings.valid, false);
  assert.equal(withoutEarnings.report.results.beatRate, null);

  const invalidDcf = runResearch("AAPL", { assumptions: { ...base.report.assumptions, wacc: 1 } });
  assert.equal(invalidDcf.calculations.dcf.valid, false);
  assert.equal(invalidDcf.report.results.valuePerShare, null);
  assert.equal(invalidDcf.report.results.upsidePercent, null);
});
