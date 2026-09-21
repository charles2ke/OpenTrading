import { fundamentals, securities } from "./dataset.js";

export const SCREENER_FIELDS = Object.freeze([
  { key: "marketCap", label: "Market cap", unit: "$m" },
  { key: "revenueGrowth", label: "Revenue growth", unit: "%" },
  { key: "epsGrowth", label: "EPS growth", unit: "%" },
  { key: "pe", label: "P/E", unit: "x" },
  { key: "forwardPe", label: "Forward P/E", unit: "x" },
  { key: "peg", label: "PEG", unit: "x" },
  { key: "evEbitda", label: "EV/EBITDA", unit: "x" },
  { key: "priceToFcf", label: "Price/FCF", unit: "x" },
  { key: "roic", label: "ROIC", unit: "%" },
  { key: "roe", label: "ROE", unit: "%" },
  { key: "grossMargin", label: "Gross margin", unit: "%" },
  { key: "operatingMargin", label: "Operating margin", unit: "%" },
  { key: "netMargin", label: "Net margin", unit: "%" },
  { key: "debtToEquity", label: "Debt/equity", unit: "x" },
  { key: "freeCashFlow", label: "Free cash flow", unit: "$m" },
  { key: "dividendYield", label: "Dividend yield", unit: "%" },
  { key: "payoutRatio", label: "Payout ratio", unit: "%" },
  { key: "momentum12m", label: "Momentum (12m)", unit: "%" },
  { key: "volatility", label: "Volatility", unit: "%" }
]);

export function universe() {
  return securities.map((security) => ({
    symbol: security.symbol,
    name: security.name,
    exchange: security.exchange,
    currency: security.currency,
    country: security.country,
    region: security.region,
    sector: security.sector,
    industry: security.industry,
    price: security.price,
    marketCap: security.marketCap,
    ...fundamentals[security.symbol]
  }));
}

function inRange(value, range) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (Number.isFinite(range?.min) && value < range.min) return false;
  if (Number.isFinite(range?.max) && value > range.max) return false;
  return true;
}

function matchesList(value, list) {
  return !Array.isArray(list) || list.length === 0 || list.includes(value);
}

export function applyFilters(rows, filters = {}) {
  const { sectors, industries, regions, ...ranges } = filters;
  return rows.filter((row) =>
    matchesList(row.sector, sectors) &&
    matchesList(row.industry, industries) &&
    matchesList(row.region, regions) &&
    Object.entries(ranges).every(([field, range]) => inRange(row[field], range)));
}

export function sortRows(rows, field, direction = "desc") {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = left[field];
    const b = right[field];
    const aMissing = typeof a !== "number" || !Number.isFinite(a);
    const bMissing = typeof b !== "number" || !Number.isFinite(b);
    if (aMissing && bMissing) return left.symbol.localeCompare(right.symbol);
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (a === b) return left.symbol.localeCompare(right.symbol);
    return (a - b) * factor;
  });
}

export function screen({ filters = {}, sort = { field: "marketCap", direction: "desc" }, limit } = {}) {
  const matches = sortRows(applyFilters(universe(), filters), sort.field, sort.direction);
  const rows = Number.isInteger(limit) && limit > 0 ? matches.slice(0, limit) : matches;
  return { rows, matched: matches.length, universeSize: securities.length, filters, sort };
}

export function compareSecurities(symbols, fields = SCREENER_FIELDS.map((field) => field.key)) {
  const rows = universe();
  const selected = (symbols ?? [])
    .map((symbol) => rows.find((row) => row.symbol === String(symbol).toUpperCase()))
    .filter(Boolean);
  return fields.map((field) => ({
    field,
    label: SCREENER_FIELDS.find((definition) => definition.key === field)?.label ?? field,
    values: selected.map((row) => ({
      symbol: row.symbol,
      value: typeof row[field] === "number" && Number.isFinite(row[field]) ? row[field] : null
    }))
  }));
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns = ["symbol", "name", "sector", "marketCap", "pe", "revenueGrowth", "roic", "dividendYield"]) {
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(","));
  return [header, ...body].join("\n");
}
