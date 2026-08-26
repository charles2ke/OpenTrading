import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_COLUMNS,
  auditExport,
  auditFileName,
  filterAuditEvents,
  normalizeAuditEvent,
  normalizeAuditEvents,
  summarizeAuditEvents,
  toAuditCsv,
  toAuditJson
} from "../src/core/audit.js";

const sample = [
  { occurredAt: "2026-01-05T09:00:00.000Z", action: "auth.login.complete", actor: "actor:abc", status: "success", metadata: { provider: "google" } },
  { occurredAt: "2026-01-06T09:30:00.000Z", action: "portfolio.write", actor: "actor:abc", status: "failure", metadata: { symbols: 2 } }
];

test("normalizes single audit events and defaults unknown fields", () => {
  assert.deepEqual(normalizeAuditEvent(), {
    occurredAt: "",
    action: "unknown",
    actor: "actor:anonymous",
    status: "success",
    metadata: {}
  });
  assert.deepEqual(normalizeAuditEvent({ occurredAt: "not-a-date", status: "weird", metadata: ["x"] }), {
    occurredAt: "",
    action: "unknown",
    actor: "actor:anonymous",
    status: "success",
    metadata: {}
  });
  assert.deepEqual(normalizeAuditEvent(sample[1]), sample[1]);
});

test("normalizes payloads into newest-first lists", () => {
  assert.deepEqual(normalizeAuditEvents({ events: sample }).map((event) => event.action), ["portfolio.write", "auth.login.complete"]);
  assert.deepEqual(normalizeAuditEvents(sample).length, 2);
  assert.deepEqual(normalizeAuditEvents({ error: "nope" }), []);
});

test("filters audit events by status and free text", () => {
  const events = normalizeAuditEvents(sample);
  assert.deepEqual(filterAuditEvents(events).length, 2);
  assert.deepEqual(filterAuditEvents(events, { status: "failure" }).map((event) => event.action), ["portfolio.write"]);
  assert.deepEqual(filterAuditEvents(events, { query: "  GOOGLE " }).map((event) => event.action), ["auth.login.complete"]);
  assert.deepEqual(filterAuditEvents(events, { query: "missing" }), []);
  assert.deepEqual(filterAuditEvents(events, { query: "login", status: "failure" }), []);
  assert.deepEqual(filterAuditEvents([{ ...events[1], metadata: null }], { query: "login" }).length, 1);
  assert.deepEqual(filterAuditEvents([{ ...events[0], metadata: ["x"] }], { query: "zzz" }), []);
});

test("summarizes audit events", () => {
  assert.deepEqual(summarizeAuditEvents(normalizeAuditEvents(sample)), {
    total: 2,
    failures: 1,
    latest: "2026-01-06T09:30:00.000Z"
  });
  assert.deepEqual(summarizeAuditEvents([]), { total: 0, failures: 0, latest: "" });
});

test("exports audit events as escaped CSV", () => {
  const csv = toAuditCsv(normalizeAuditEvents([
    ...sample,
    { occurredAt: "2026-01-07T09:30:00.000Z", action: 'trade,"risky"', actor: "actor:abc", status: "success", metadata: { note: "line\nbreak" } }
  ]));
  const lines = csv.split("\r\n");
  assert.equal(lines[0], AUDIT_COLUMNS.join(","));
  assert.match(lines[1], /"trade,""risky"""/);
  assert.match(lines[1], /"note=""line\\nbreak"""/);
  assert.equal(lines.length, 4);
  assert.equal(toAuditCsv([]), AUDIT_COLUMNS.join(","));
  assert.equal(toAuditCsv([{ metadata: {} }]).split("\r\n")[1], ",,,,");
});

test("exports audit events as JSON with an export timestamp", () => {
  const payload = JSON.parse(toAuditJson(normalizeAuditEvents(sample)));
  assert.equal(payload.events.length, 2);
  assert.match(payload.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("selects the export format and file name", () => {
  assert.equal(auditExport([], "json").type, "application/json;charset=utf-8");
  assert.equal(auditExport([], "csv").type, "text/csv;charset=utf-8");
  assert.equal(auditExport([], "csv").content, AUDIT_COLUMNS.join(","));
  assert.equal(auditFileName("json", new Date("2026-01-05T09:00:00.000Z")), "opentrading-audit-2026-01-05T09-00-00.json");
  assert.equal(auditFileName("csv", new Date("2026-01-05T09:00:00.000Z")), "opentrading-audit-2026-01-05T09-00-00.csv");
  assert.match(auditFileName("csv"), /^opentrading-audit-.+\.csv$/);
});
