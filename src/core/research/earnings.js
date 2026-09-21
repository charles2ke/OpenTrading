import { earnings, securityBySymbol } from "./dataset.js";
import { mean } from "./stats.js";
import { missing } from "./provenance.js";

function surprise(reported, consensus) {
  if (!Number.isFinite(reported) || !Number.isFinite(consensus) || consensus === 0) return null;
  return ((reported - consensus) / Math.abs(consensus)) * 100;
}

export function analyzeEarnings(symbol) {
  const security = securityBySymbol(symbol);
  if (!security) return { valid: false, errors: ["Unknown security."] };
  const record = earnings[security.symbol];
  if (!record) {
    return {
      valid: false,
      errors: ["Earnings history is not available for this security."],
      unavailable: [missing("earnings", "not covered by the data provider")]
    };
  }
  const quarters = record.quarters.map((quarter) => ({
    ...quarter,
    epsSurprisePercent: surprise(quarter.reportedEps, quarter.consensusEps),
    revenueSurprisePercent: surprise(quarter.reportedRevenue, quarter.consensusRevenue)
  }));
  const guidance = record.guidance.map((item) => ({
    ...item,
    midpoint: (item.low + item.high) / 2,
    versusConsensus: (item.low + item.high) / 2 - item.consensus
  }));
  return {
    valid: true,
    errors: [],
    symbol: security.symbol,
    name: security.name,
    nextDate: record.nextDate,
    quarters,
    guidance,
    kpis: record.kpis,
    averageEpsSurprisePercent: mean(quarters.map((quarter) => quarter.epsSurprisePercent).filter(Number.isFinite)),
    averageRevenueSurprisePercent: mean(quarters.map((quarter) => quarter.revenueSurprisePercent).filter(Number.isFinite)),
    beatRate: quarters.filter((quarter) => quarter.epsSurprisePercent > 0).length / quarters.length,
    averageReactionPercent: mean(quarters.map((quarter) => quarter.priceReaction)),
    impliedMove: Number.isFinite(record.impliedMovePercent)
      ? { percent: record.impliedMovePercent, basis: "options-implied straddle" }
      : missing("impliedMove", "reliable options data unavailable"),
    scenarios: earningsScenarios(quarters, record, security)
  };
}

export function earningsScenarios(quarters, record, security) {
  const averageReaction = mean(quarters.map((quarter) => quarter.priceReaction));
  const move = Number.isFinite(record.impliedMovePercent)
    ? record.impliedMovePercent
    : Math.max(...quarters.map((quarter) => Math.abs(quarter.priceReaction)));
  return [
    {
      scenario: "bull",
      description: "Beat and raise: results above consensus with guidance above the consensus midpoint.",
      priceChangePercent: move,
      impliedPrice: security.price * (1 + move / 100)
    },
    {
      scenario: "base",
      description: "In-line results with guidance matching consensus.",
      priceChangePercent: averageReaction,
      impliedPrice: security.price * (1 + averageReaction / 100)
    },
    {
      scenario: "bear",
      description: "Miss or cut: results below consensus or weaker guidance.",
      priceChangePercent: -move,
      impliedPrice: security.price * (1 - move / 100)
    }
  ];
}

export function upcomingEarnings(symbols, from = "2026-01-05") {
  return (symbols ?? [])
    .map((symbol) => securityBySymbol(symbol))
    .filter(Boolean)
    .map((security) => ({ symbol: security.symbol, name: security.name, date: earnings[security.symbol]?.nextDate ?? null }))
    .filter((entry) => entry.date !== null && entry.date >= from)
    .sort((left, right) => left.date.localeCompare(right.date));
}
