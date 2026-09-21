import { fundamentals, marketShare, securities, securityBySymbol } from "./dataset.js";
import { missing } from "./provenance.js";

export const COMPARISON_METRICS = Object.freeze([
  { key: "marketCap", label: "Market cap", unit: "$m" },
  { key: "revenue", label: "Revenue", unit: "$m" },
  { key: "revenueGrowth", label: "Revenue growth", unit: "%" },
  { key: "grossMargin", label: "Gross margin", unit: "%" },
  { key: "operatingMargin", label: "Operating margin", unit: "%" },
  { key: "fcfMargin", label: "FCF margin", unit: "%" },
  { key: "roic", label: "ROIC", unit: "%" },
  { key: "researchDevelopment", label: "R&D", unit: "$m" },
  { key: "forwardPe", label: "Forward P/E", unit: "x" }
]);

export const COMPETITIVE_DIMENSIONS = Object.freeze([
  "Brand", "Cost position", "Switching costs", "Network effects", "Scale", "Distribution", "Intellectual property", "Regulation", "Ecosystem"
]);

function metrics(symbol) {
  const security = securityBySymbol(symbol);
  const data = fundamentals[security.symbol];
  return {
    symbol: security.symbol,
    name: security.name,
    marketCap: security.marketCap,
    revenue: data.revenue,
    revenueGrowth: data.revenueGrowth,
    grossMargin: data.grossMargin,
    operatingMargin: data.operatingMargin,
    fcfMargin: data.revenue ? (data.freeCashFlow / data.revenue) * 100 : null,
    roic: data.roic,
    researchDevelopment: data.researchDevelopment,
    forwardPe: data.forwardPe
  };
}

export function peerSet(symbol, limit = 3) {
  const security = securityBySymbol(symbol);
  if (!security) return [];
  const explicit = security.peers ?? [];
  const sameIndustry = securities
    .filter((peer) => peer.symbol !== security.symbol && peer.industry === security.industry)
    .map((peer) => peer.symbol);
  const unique = [...new Set([...sameIndustry, ...explicit])];
  return unique.slice(0, limit);
}

export function marketShareTrend(symbol) {
  const security = securityBySymbol(symbol);
  const trend = security ? marketShare[security.symbol] : null;
  return trend ?? missing("marketShare", "no reliable market-share series available");
}

function dimensionEvidence(company, peers, dimension) {
  const peerAverage = (field) => {
    const values = peers.map((peer) => peer[field]).filter((value) => Number.isFinite(value));
    return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
  };
  const byDimension = {
    Brand: { field: "operatingMargin", note: "Operating margin relative to peers is used as a pricing-power proxy." },
    "Cost position": { field: "grossMargin", note: "Gross margin is used as a unit-cost proxy." },
    "Switching costs": { field: "operatingMargin", note: "Sustained margins can indicate customer lock-in." },
    "Network effects": { field: "revenueGrowth", note: "Relative growth is used as an adoption proxy." },
    Scale: { field: "revenue", note: "Absolute revenue versus peers." },
    Distribution: { field: "revenue", note: "Revenue scale is used as a reach proxy." },
    "Intellectual property": { field: "researchDevelopment", note: "R&D spend versus peers." },
    Regulation: { field: null, note: "No structured regulatory dataset is wired up." },
    Ecosystem: { field: "fcfMargin", note: "Free-cash-flow margin is used as a monetisation proxy." }
  };
  const { field, note } = byDimension[dimension];
  if (!field) return { dimension, assessment: "unknown", note, evidence: null };
  const value = company[field];
  const average = peerAverage(field);
  if (!Number.isFinite(value) || average === null) return { dimension, assessment: "unknown", note, evidence: null };
  const ratio = average === 0 ? null : value / average;
  return {
    dimension,
    assessment: ratio === null ? "unknown" : ratio >= 1.15 ? "advantaged" : ratio >= 0.85 ? "in line" : "disadvantaged",
    note,
    evidence: { field, company: value, peerAverage: average }
  };
}

export function competitiveLandscape(symbol, { peers: requestedPeers } = {}) {
  const security = securityBySymbol(symbol);
  if (!security) return { valid: false, errors: ["Unknown security."] };
  const peerSymbols = (requestedPeers ?? peerSet(security.symbol)).map((peer) => securityBySymbol(peer)).filter(Boolean).map((peer) => peer.symbol);
  const company = metrics(security.symbol);
  const peers = peerSymbols.map((peer) => metrics(peer));
  const data = fundamentals[security.symbol];
  return {
    valid: true,
    errors: [],
    symbol: security.symbol,
    name: security.name,
    industry: security.industry,
    peers: peerSymbols,
    comparison: COMPARISON_METRICS.map((metric) => ({
      metric: metric.label,
      key: metric.key,
      unit: metric.unit,
      company: company[metric.key],
      peers: peers.map((peer) => ({ symbol: peer.symbol, value: peer[metric.key] }))
    })),
    dimensions: COMPETITIVE_DIMENSIONS.map((dimension) => dimensionEvidence(company, peers, dimension)),
    marketShare: marketShareTrend(security.symbol),
    innovation: Number.isFinite(data.researchDevelopment)
      ? { rAndDIntensityPercent: (data.researchDevelopment / data.revenue) * 100, source: "reported R&D expense / revenue" }
      : missing("innovation", "R&D expense is not reported for this security"),
    capitalAllocation: {
      dividendYieldPercent: data.dividendYield,
      payoutRatioPercent: data.payoutRatio,
      freeCashFlow: data.freeCashFlow,
      source: "reported fundamentals"
    },
    risks: [
      { risk: "Valuation", detail: `Forward P/E of ${data.forwardPe}x versus a peer average of ${(peers.reduce((total, peer) => total + (peer.forwardPe ?? 0), 0) / (peers.length || 1)).toFixed(1)}x.` },
      { risk: "Growth durability", detail: `Revenue growth of ${data.revenueGrowth}% must be sustained to support the current multiple.` },
      { risk: "Leverage", detail: `Debt/equity of ${data.debtToEquity}x.` }
    ],
    catalysts: [
      { catalyst: "Earnings", detail: "Quarterly results and guidance versus consensus." },
      { catalyst: "Margin trajectory", detail: `Operating margin currently ${data.operatingMargin}%.` }
    ]
  };
}
