export const BASE_CURRENCY = "USD";
export const MAX_FX_CURRENCIES = 25;

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function normalizeCurrency(value) {
  const currency = typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : "";
  return CURRENCY_PATTERN.test(currency) ? currency : "";
}

function positiveRate(value) {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

export function normalizeRateTable(raw, fallbackBase = BASE_CURRENCY) {
  const base = normalizeCurrency(raw?.base) || normalizeCurrency(fallbackBase);
  if (!base) return null;
  const rates = { [base]: 1 };
  for (const [currency, value] of Object.entries(raw?.rates ?? {})) {
    const code = normalizeCurrency(currency);
    const rate = positiveRate(value);
    if (code && rate) rates[code] = rate;
  }
  return { base, asOf: normalizeTimestamp(raw?.asOf), rates };
}

export function exchangeRate(from, to, table) {
  const source = normalizeCurrency(from);
  const target = normalizeCurrency(to);
  if (!source || !target || !table) return null;
  if (source === target) return 1;
  const sourceRate = positiveRate(table.rates?.[source]);
  const targetRate = positiveRate(table.rates?.[target]);
  if (!sourceRate || !targetRate) return null;
  return targetRate / sourceRate;
}

export function convertAmount(amount, from, to, table) {
  const value = typeof amount === "string" || typeof amount === "number" ? Number(amount) : Number.NaN;
  const rate = exchangeRate(from, to, table);
  if (!Number.isFinite(value) || rate === null) return null;
  return Math.round(value * rate * 100) / 100;
}

export function requestedCurrencies(value) {
  return [...new Set(String(value ?? "")
    .split(",")
    .map((currency) => normalizeCurrency(currency))
    .filter(Boolean))].slice(0, MAX_FX_CURRENCIES);
}
