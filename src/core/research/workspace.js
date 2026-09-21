import { DATA_AS_OF, DATA_PROVIDER, DATA_SOURCE, fundamentals, securities, securityBySymbol } from "./dataset.js";
import { freshness, sourced } from "./provenance.js";

export const MODULES = Object.freeze([
  { id: "dashboard", label: "Dashboard" },
  { id: "discover", label: "Discover" },
  { id: "company", label: "Company research" },
  { id: "portfolio", label: "Portfolio" },
  { id: "macro", label: "Macro" },
  { id: "watchlists", label: "Watchlists" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" }
]);

export const COMPANY_TABS = Object.freeze([
  "Overview", "Financials", "Valuation", "Earnings", "Technicals", "Quant", "Competition", "Ownership", "News"
]);

export const DASHBOARD_WIDGETS = Object.freeze([
  "portfolio-value", "watchlist", "market-overview", "upcoming-earnings", "macro-calendar",
  "risk-alerts", "recent-research", "saved-screens", "analysis-shortcuts"
]);

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function searchSecurities(query) {
  const term = normalize(query);
  if (term === "") return securities.map(canonicalSecurity);
  return securities
    .filter((security) => [security.symbol, security.name, security.exchange, security.sector, security.industry]
      .some((field) => normalize(field).includes(term)))
    .map((security) => canonicalSecurity(security.symbol));
}

export function canonicalSecurity(symbol) {
  const security = securityBySymbol(symbol);
  if (!security) return null;
  return {
    symbol: security.symbol,
    name: security.name,
    exchange: security.exchange,
    currency: security.currency,
    country: security.country,
    region: security.region,
    sector: security.sector,
    industry: security.industry
  };
}

export function companyHeader(symbol, now = Date.parse(DATA_AS_OF)) {
  const security = securityBySymbol(symbol);
  if (!security) return null;
  const price = sourced(security.price, {
    field: "price", provider: DATA_PROVIDER, source: DATA_SOURCE, asOf: DATA_AS_OF, currency: security.currency
  });
  return {
    ...canonicalSecurity(security.symbol),
    price: security.price,
    previousClose: security.previousClose,
    changePercent: ((security.price - security.previousClose) / security.previousClose) * 100,
    marketCap: security.marketCap,
    tabs: [...COMPANY_TABS],
    dataFreshness: freshness(price, now),
    provenance: { provider: price.provider, source: price.source, asOf: price.asOf }
  };
}

export function defaultDcfAssumptions(symbol) {
  const security = securityBySymbol(symbol);
  if (!security) return null;
  const data = fundamentals[security.symbol];
  const depreciationPercent = 5;
  return {
    revenue: data.revenue,
    revenueGrowth: data.revenueGrowth,
    operatingMargin: data.operatingMargin ?? 15,
    taxRate: 21,
    depreciationPercent,
    capexPercent: 6,
    workingCapitalPercent: 2,
    wacc: 8.5,
    terminalGrowth: 2.5,
    exitMultiple: 14,
    netDebt: security.netDebt,
    dilutedShares: security.dilutedShares,
    currentPrice: security.price
  };
}

export function dashboard({ portfolioSummary = null, watchlist = [], recentReports = [], savedScreens = [] } = {}) {
  return {
    widgets: [...DASHBOARD_WIDGETS],
    portfolio: portfolioSummary,
    watchlist,
    marketOverview: securities.slice(0, 5).map((security) => ({
      symbol: security.symbol,
      price: security.price,
      changePercent: ((security.price - security.previousClose) / security.previousClose) * 100
    })),
    recentReports: recentReports.slice(0, 5),
    savedScreens,
    shortcuts: ["screener", "dcf", "earnings", "technicals", "risk", "macro"]
  };
}
