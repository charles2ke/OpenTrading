export const MAX_QUOTE_SYMBOLS = 25;

function normalizeSymbol(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function positiveNumber(value) {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

export function isQuote(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    normalizeSymbol(value.symbol) &&
    positiveNumber(value.price) &&
    positiveNumber(value.previousClose) &&
    !Number.isNaN(Date.parse(value.asOf))
  );
}

export function normalizeQuote(raw, symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const price = positiveNumber(raw?.price);
  if (!normalizedSymbol || !price) return null;
  return {
    symbol: normalizedSymbol,
    price,
    previousClose: positiveNumber(raw?.previousClose) ?? price,
    currency: normalizeSymbol(raw?.currency),
    asOf: normalizeTimestamp(raw?.asOf)
  };
}

export function quotesBySymbol(quotes) {
  const index = new Map();
  for (const quote of quotes ?? []) {
    if (isQuote(quote)) index.set(normalizeSymbol(quote.symbol), quote);
  }
  return index;
}

export function mergeQuotes(instruments, quotes) {
  const index = quotesBySymbol(quotes);
  return instruments.map((instrument) => {
    const quote = index.get(normalizeSymbol(instrument.symbol));
    if (!quote) return { ...instrument, source: "cached" };
    return {
      ...instrument,
      price: quote.price,
      previousClose: quote.previousClose,
      asOf: quote.asOf,
      source: "live"
    };
  });
}
