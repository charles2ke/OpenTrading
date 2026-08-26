export const AUDIT_COLUMNS = ["occurredAt", "action", "actor", "status", "metadata"];
export const AUDIT_STATUSES = ["success", "failure"];

function metadataText(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  return Object.entries(metadata).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("; ");
}

export function normalizeAuditEvent(event = {}) {
  const occurredAt = new Date(event.occurredAt ?? "");
  const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {};
  return {
    occurredAt: Number.isNaN(occurredAt.getTime()) ? "" : occurredAt.toISOString(),
    action: String(event.action ?? "unknown"),
    actor: String(event.actor ?? "actor:anonymous"),
    status: AUDIT_STATUSES.includes(event.status) ? event.status : "success",
    metadata
  };
}

export function normalizeAuditEvents(value) {
  const events = Array.isArray(value) ? value : Array.isArray(value?.events) ? value.events : [];
  return events.map(normalizeAuditEvent).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export function filterAuditEvents(events, { query = "", status = "all" } = {}) {
  const term = query.trim().toLowerCase();
  return events.filter((event) => {
    if (status !== "all" && event.status !== status) return false;
    if (!term) return true;
    return [event.action, event.actor, event.occurredAt, metadataText(event.metadata)]
      .some((field) => field.toLowerCase().includes(term));
  });
}

export function summarizeAuditEvents(events) {
  return {
    total: events.length,
    failures: events.filter((event) => event.status === "failure").length,
    latest: events[0]?.occurredAt || ""
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toAuditCsv(events) {
  const rows = events.map((event) => AUDIT_COLUMNS
    .map((column) => csvCell(column === "metadata" ? metadataText(event.metadata) : event[column]))
    .join(","));
  return [AUDIT_COLUMNS.join(","), ...rows].join("\r\n");
}

export function toAuditJson(events) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), events }, null, 2);
}

export function auditExport(events, format) {
  return format === "json"
    ? { content: toAuditJson(events), type: "application/json;charset=utf-8" }
    : { content: toAuditCsv(events), type: "text/csv;charset=utf-8" };
}

export function auditFileName(format, date = new Date()) {
  const stamp = date.toISOString().slice(0, 19).replaceAll(":", "-");
  return `opentrading-audit-${stamp}.${format === "json" ? "json" : "csv"}`;
}
