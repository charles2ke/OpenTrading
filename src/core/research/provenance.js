export const UNAVAILABLE = "unavailable";

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function missing(field, reason = UNAVAILABLE, meta = {}) {
  return Object.freeze({
    value: null,
    available: false,
    reason: trimmed(reason) || UNAVAILABLE,
    field: trimmed(field),
    provider: trimmed(meta.provider) || "unknown",
    source: trimmed(meta.source) || "unknown",
    asOf: null,
    retrievedAt: null,
    currency: ""
  });
}

export function sourced(value, meta = {}) {
  const usable = (typeof value === "number" && Number.isFinite(value)) || typeof value === "string";
  if (!usable) return missing(meta.field, UNAVAILABLE, meta);
  return Object.freeze({
    value,
    available: true,
    reason: "",
    field: trimmed(meta.field),
    provider: trimmed(meta.provider) || "unknown",
    source: trimmed(meta.source) || "unknown",
    asOf: timestamp(meta.asOf),
    retrievedAt: timestamp(meta.retrievedAt) ?? timestamp(meta.asOf),
    currency: trimmed(meta.currency).toUpperCase()
  });
}

export function isAvailable(record) {
  return Boolean(record && record.available === true);
}

export function valueOf(record, fallback = null) {
  return isAvailable(record) ? record.value : fallback;
}

export function missingFields(records) {
  return Object.entries(records ?? {})
    .filter(([, record]) => !isAvailable(record))
    .map(([key, record]) => record?.field || key);
}

export function sources(records) {
  const unique = new Map();
  for (const record of Object.values(records ?? {})) {
    if (!isAvailable(record)) continue;
    const key = `${record.provider}|${record.source}|${record.asOf}`;
    if (!unique.has(key)) unique.set(key, { provider: record.provider, source: record.source, asOf: record.asOf });
  }
  return [...unique.values()];
}

export function freshness(record, now = Date.now()) {
  if (!isAvailable(record) || !record.asOf) return { label: "unavailable", ageMinutes: null };
  const ageMinutes = Math.max(0, Math.round((now - Date.parse(record.asOf)) / 60_000));
  if (ageMinutes <= 15) return { label: "live", ageMinutes };
  if (ageMinutes <= 1440) return { label: "delayed", ageMinutes };
  return { label: "stale", ageMinutes };
}
