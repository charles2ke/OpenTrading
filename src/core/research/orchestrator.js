import { DATA_AS_OF, DATA_PROVIDER, DATA_SOURCE, fundamentals, securityBySymbol } from "./dataset.js";
import { isAvailable, missing, sourced } from "./provenance.js";
import { analyzeEarnings } from "./earnings.js";
import { analyzeTechnicals } from "./technicals.js";
import { competitiveLandscape } from "./competition.js";
import { macroDashboard } from "./macro.js";
import { runDcf } from "./dcf.js";
import { createReport } from "./reports.js";
import { companyHeader, defaultDcfAssumptions } from "./workspace.js";

export const ORCHESTRATOR_VERSION = "research-orchestrator-1";

function record(field, value, currency) {
  return sourced(value, { field, provider: DATA_PROVIDER, source: DATA_SOURCE, asOf: DATA_AS_OF, currency });
}

export function buildGroundingPacket(symbol, { assumptions = {}, calculations = {} } = {}) {
  const security = securityBySymbol(symbol);
  if (!security) return { valid: false, errors: ["Unknown security."] };
  const data = fundamentals[security.symbol];
  const marketData = {
    price: record("price", security.price, security.currency),
    previousClose: record("previousClose", security.previousClose, security.currency),
    marketCap: record("marketCap", security.marketCap, security.currency)
  };
  const financials = Object.fromEntries(Object.entries(data)
    .map(([field, value]) => [field, record(field, value, security.currency)]));
  const unavailable = Object.entries({ ...marketData, ...financials })
    .filter(([, entry]) => !isAvailable(entry))
    .map(([field]) => field);
  return {
    valid: true,
    errors: [],
    security: companyHeader(security.symbol),
    marketData,
    financials,
    calculatedMetrics: calculations,
    filings: missing("filings", "no filings archive connected"),
    macro: macroDashboard(),
    assumptions,
    unavailable,
    instruction: "Interpret only the values supplied in this packet. State missing data explicitly instead of estimating it."
  };
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function interpret(packet) {
  if (!packet.valid) return { valid: false, errors: packet.errors };
  const lines = [];
  const { security, financials, calculatedMetrics } = packet;
  lines.push(`${security.name} (${security.symbol}) trades on ${security.exchange} in ${security.currency} within the ${security.sector} sector.`);
  lines.push(`Reported revenue growth is ${formatPercent(financials.revenueGrowth.value)} with an operating margin of ${financials.operatingMargin.value}% and ROE of ${financials.roe.value}%.`);
  if (calculatedMetrics.dcf?.valid) {
    const { valuePerShare, currentPrice, upsidePercent } = calculatedMetrics.dcf.perpetuityGrowth;
    lines.push(`The perpetuity-growth DCF, using the supplied assumptions, implies ${valuePerShare.toFixed(2)} per share against a market price of ${currentPrice.toFixed(2)} (${formatPercent(upsidePercent)}). This is a calculation from user assumptions, not a price target.`);
  }
  if (calculatedMetrics.technicals?.valid) {
    const bullish = calculatedMetrics.technicals.signals.filter((signal) => signal.direction === "bullish").length;
    const bearish = calculatedMetrics.technicals.signals.filter((signal) => signal.direction === "bearish").length;
    lines.push(`Technical signals are mixed: ${bullish} bullish and ${bearish} bearish observations, which describe probabilities rather than outcomes.`);
  }
  if (calculatedMetrics.earnings?.valid) {
    lines.push(`Across the last four quarters the EPS beat rate is ${(calculatedMetrics.earnings.beatRate * 100).toFixed(0)}% with an average share-price reaction of ${formatPercent(calculatedMetrics.earnings.averageReactionPercent)}.`);
  }
  if (packet.unavailable.length > 0) {
    lines.push(`Not available from the connected data sources: ${packet.unavailable.join(", ")}. These values were not estimated.`);
  }
  lines.push("Filings are not connected in this deployment, so no filing-based conclusions are drawn.");
  return {
    valid: true,
    errors: [],
    model: ORCHESTRATOR_VERSION,
    narrative: lines,
    grounding: {
      fields: Object.keys(packet.financials),
      unavailable: packet.unavailable,
      source: { provider: DATA_PROVIDER, source: DATA_SOURCE, asOf: DATA_AS_OF }
    }
  };
}

export function runResearch(symbol, { assumptions = null, title = null } = {}) {
  const security = securityBySymbol(symbol);
  if (!security) return { valid: false, errors: ["Unknown security."] };
  const dcfAssumptions = assumptions ?? defaultDcfAssumptions(security.symbol);
  const calculations = {
    dcf: runDcf(dcfAssumptions),
    technicals: analyzeTechnicals(security.symbol),
    earnings: analyzeEarnings(security.symbol),
    competition: competitiveLandscape(security.symbol)
  };
  const packet = buildGroundingPacket(security.symbol, { assumptions: dcfAssumptions, calculations });
  const interpretation = interpret(packet);
  return {
    valid: true,
    errors: [],
    symbol: security.symbol,
    calculations,
    packet,
    interpretation,
    report: createReport({
      title: title ?? `${security.name} research note`,
      module: "company-research",
      symbol: security.symbol,
      assumptions: dcfAssumptions,
      results: {
        valuePerShare: calculations.dcf.valid ? calculations.dcf.perpetuityGrowth.valuePerShare : null,
        upsidePercent: calculations.dcf.valid ? calculations.dcf.perpetuityGrowth.upsidePercent : null,
        beatRate: calculations.earnings.valid ? calculations.earnings.beatRate : null
      },
      narrative: interpretation.narrative,
      modelVersion: ORCHESTRATOR_VERSION
    })
  };
}
