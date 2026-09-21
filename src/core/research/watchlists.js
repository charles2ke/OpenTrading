import { dividends, earnings, fundamentals, securityBySymbol } from "./dataset.js";

export const ALERT_TYPES = Object.freeze(["price", "earnings", "valuation", "dividend", "technical", "concentration", "macro"]);

export function createWatchlist(name) {
  const label = String(name ?? "").trim();
  if (label === "") throw new TypeError("A watchlist needs a name.");
  return { id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: label, symbols: [] };
}

export function addToWatchlist(watchlist, symbol) {
  const security = securityBySymbol(symbol);
  if (!security || watchlist.symbols.includes(security.symbol)) return watchlist;
  return { ...watchlist, symbols: [...watchlist.symbols, security.symbol] };
}

export function removeFromWatchlist(watchlist, symbol) {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  return { ...watchlist, symbols: watchlist.symbols.filter((entry) => entry !== normalized) };
}

export function watchlistView(watchlist) {
  return watchlist.symbols.map((symbol) => {
    const security = securityBySymbol(symbol);
    const metrics = fundamentals[symbol];
    return {
      symbol,
      name: security.name,
      price: security.price,
      changePercent: ((security.price - security.previousClose) / security.previousClose) * 100,
      forwardPe: metrics.forwardPe,
      dividendYieldPercent: metrics.dividendYield,
      nextEarnings: earnings[symbol]?.nextDate ?? null
    };
  });
}

export function createAlert({ type, symbol = null, threshold = null, direction = "above" }) {
  if (!ALERT_TYPES.includes(type)) throw new TypeError("Unsupported alert type.");
  const security = symbol === null ? null : securityBySymbol(symbol);
  if (symbol !== null && !security) throw new TypeError("Unknown security.");
  return {
    id: `${type}:${security?.symbol ?? "portfolio"}:${threshold ?? "event"}`,
    type,
    symbol: security?.symbol ?? null,
    threshold,
    direction,
    createdAt: null
  };
}

function triggered(alert, context) {
  const security = alert.symbol ? securityBySymbol(alert.symbol) : null;
  const metrics = alert.symbol ? fundamentals[alert.symbol] : null;
  switch (alert.type) {
    case "price":
      return alert.direction === "above" ? security.price >= alert.threshold : security.price <= alert.threshold;
    case "valuation":
      return metrics.forwardPe <= alert.threshold;
    case "dividend":
      return (dividends[alert.symbol]?.lastCutYear ?? null) !== null;
    case "earnings":
      return (earnings[alert.symbol]?.nextDate ?? null) !== null && earnings[alert.symbol].nextDate <= (context.horizonDate ?? "9999-12-31");
    case "technical":
      return context.technicalSignals?.some((signal) => signal.direction !== "neutral") ?? false;
    case "concentration":
      return (context.largestPositionPercent ?? 0) >= alert.threshold;
    default:
      return (context.macroReleases ?? []).length > 0;
  }
}

export function evaluateAlerts(alerts, context = {}) {
  return (alerts ?? []).map((alert) => ({
    ...alert,
    triggered: triggered(alert, context),
    evaluatedWith: { type: alert.type, symbol: alert.symbol, threshold: alert.threshold }
  }));
}
