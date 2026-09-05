export const BROKER_ID = "trading212";
export const SUPPORTED_BROKER_CURRENCIES = Object.freeze(["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "INR"]);

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function quantity(value) {
  const shares = Number(value);
  return Number.isFinite(shares) ? Math.round(shares * 1e8) / 1e8 : 0;
}

export function brokerSymbol(ticker) {
  return String(ticker ?? "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 32).toUpperCase();
}

export function normalizeBrokerCurrency(value) {
  const currency = String(value ?? "").trim().toUpperCase();
  return SUPPORTED_BROKER_CURRENCIES.includes(currency) ? currency : "";
}

export function normalizeBrokerPosition(position) {
  const symbol = brokerSymbol(position?.ticker);
  const shares = quantity(position?.quantity);
  if (!symbol || shares <= 0) return null;
  const averagePrice = money(position?.averagePrice);
  const price = money(position?.currentPrice);
  return Object.freeze({
    symbol,
    quantity: shares,
    averagePrice,
    price,
    value: money(price * shares),
    returnValue: money(Number(position?.ppl ?? (price - averagePrice) * shares))
  });
}

export function normalizeBrokerPositions(positions) {
  return (Array.isArray(positions) ? positions : [])
    .slice(0, 500)
    .map(normalizeBrokerPosition)
    .filter(Boolean);
}

export function normalizeBrokerCash(cash, currency = "") {
  return Object.freeze({
    currency: normalizeBrokerCurrency(currency),
    free: money(cash?.free),
    invested: money(cash?.invested),
    total: money(cash?.total),
    result: money(cash?.ppl ?? cash?.result)
  });
}

export function summarizeBrokerAccount(cash, positions) {
  const holdings = normalizeBrokerPositions(positions);
  const holdingsValue = money(holdings.reduce((total, position) => total + position.value, 0));
  return Object.freeze({
    broker: BROKER_ID,
    currency: cash.currency,
    cash: cash.free,
    holdingsValue,
    accountValue: money(cash.free + holdingsValue),
    returnValue: cash.result,
    positions: Object.freeze(holdings)
  });
}
