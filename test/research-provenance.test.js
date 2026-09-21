import assert from "node:assert/strict";
import test from "node:test";
import { UNAVAILABLE, freshness, isAvailable, missing, missingFields, sourced, sources, valueOf } from "../src/core/research/provenance.js";

test("builds immutable missing records with normalized fallbacks", () => {
  const record = missing(" metric ", "  ", { provider: "  ", source: " Feed " });
  assert.deepEqual(record, {
    value: null,
    available: false,
    reason: UNAVAILABLE,
    field: "metric",
    provider: "unknown",
    source: "Feed",
    asOf: null,
    retrievedAt: null,
    currency: ""
  });
  assert.equal(Object.isFrozen(record), true);

  assert.deepEqual(missing(7, undefined, { provider: 3, source: null }).field, "");
});

test("sources available numbers and strings with timestamp and currency metadata", () => {
  assert.deepEqual(sourced(12.5, {
    field: " pe ",
    provider: " Vendor ",
    source: " File ",
    asOf: "2026-01-05T21:00:00Z",
    retrievedAt: "not a date",
    currency: " usd "
  }), {
    value: 12.5,
    available: true,
    reason: "",
    field: "pe",
    provider: "Vendor",
    source: "File",
    asOf: "2026-01-05T21:00:00.000Z",
    retrievedAt: "2026-01-05T21:00:00.000Z",
    currency: "USD"
  });

  assert.deepEqual(sourced("reported", { asOf: "bad", retrievedAt: "2026-01-06", currency: 5 }), {
    value: "reported",
    available: true,
    reason: "",
    field: "",
    provider: "unknown",
    source: "unknown",
    asOf: null,
    retrievedAt: "2026-01-06T00:00:00.000Z",
    currency: ""
  });
});

test("turns unusable sourced values into missing records", () => {
  assert.deepEqual(sourced(Number.NaN, { field: "eps", provider: "Vendor" }), missing("eps", UNAVAILABLE, { field: "eps", provider: "Vendor" }));
  assert.equal(sourced({}, { field: "roe" }).available, false);
});

test("detects availability and returns fallback values", () => {
  const available = sourced(42, { field: "answer" });
  assert.equal(isAvailable(available), true);
  assert.equal(isAvailable({ available: false }), false);
  assert.equal(isAvailable(null), false);
  assert.equal(valueOf(available, 0), 42);
  assert.equal(valueOf(missing("answer"), 0), 0);
});

test("lists missing fields and unique source metadata", () => {
  const first = sourced(1, { field: "pe", provider: "Vendor", source: "Feed", asOf: "2026-01-05" });
  const duplicate = sourced(2, { field: "eps", provider: "Vendor", source: "Feed", asOf: "2026-01-05" });
  const other = sourced(3, { field: "roe", provider: "Other", source: "Feed", asOf: "2026-01-06" });
  const absent = missing("dividend");

  assert.deepEqual(missingFields({ absent, nameless: { available: false } }), ["dividend", "nameless"]);
  assert.deepEqual(missingFields(null), []);
  assert.deepEqual(sources({ first, duplicate, absent, other }), [
    { provider: "Vendor", source: "Feed", asOf: "2026-01-05T00:00:00.000Z" },
    { provider: "Other", source: "Feed", asOf: "2026-01-06T00:00:00.000Z" }
  ]);
  assert.deepEqual(sources(), []);
});

test("classifies freshness from source timestamps", () => {
  const now = Date.parse("2026-01-05T21:30:00.000Z");
  assert.deepEqual(freshness(missing("price"), now), { label: "unavailable", ageMinutes: null });
  assert.deepEqual(freshness(sourced(1, { asOf: "bad" }), now), { label: "unavailable", ageMinutes: null });
  assert.deepEqual(freshness(sourced(1, { asOf: "2026-01-05T21:20:00.000Z" }), now), { label: "live", ageMinutes: 10 });
  assert.deepEqual(freshness(sourced(1, { asOf: "2026-01-05T22:00:00.000Z" }), now), { label: "live", ageMinutes: 0 });
  assert.deepEqual(freshness(sourced(1, { asOf: "2026-01-05T10:00:00.000Z" }), now), { label: "delayed", ageMinutes: 690 });
  assert.deepEqual(freshness(sourced(1, { asOf: "2026-01-03T21:30:00.000Z" }), now), { label: "stale", ageMinutes: 2880 });
});
