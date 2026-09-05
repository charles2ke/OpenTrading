import assert from "node:assert/strict";
import test from "node:test";
import {
  getSupportedInstitution,
  listSupportedInstitutions,
  mergeInstitutions,
  SUPPORTED_INSTITUTIONS
} from "../src/core/institutions.js";

test("ships the directly supported institutions", () => {
  assert.deepEqual(SUPPORTED_INSTITUTIONS.map((institution) => institution.id), [
    "icici-bank",
    "hdfc-bank",
    "state-bank-of-india",
    "aib",
    "bank-of-ireland",
    "abn-amro"
  ]);
  assert.equal(Object.isFrozen(SUPPORTED_INSTITUTIONS), true);
});

test("lists institutions and filters them by country", () => {
  assert.equal(listSupportedInstitutions().length, 6);
  assert.deepEqual(listSupportedInstitutions("in").map((institution) => institution.name), [
    "ICICI Bank",
    "HDFC Bank",
    "State Bank of India"
  ]);
  assert.deepEqual(listSupportedInstitutions("NL"), [{ id: "abn-amro", name: "ABN AMRO", country: "NL" }]);
  assert.deepEqual(listSupportedInstitutions(null), listSupportedInstitutions());
  assert.deepEqual(listSupportedInstitutions("US"), []);
});

test("looks up one supported institution", () => {
  assert.equal(getSupportedInstitution("AIB").bic, "AIBKIE2DXXX");
  assert.equal(getSupportedInstitution("bank-of-ireland").rail, "SEPA");
  assert.equal(getSupportedInstitution("icici-bank").rail, "IMPS");
  assert.equal(getSupportedInstitution("unknown"), undefined);
  assert.equal(getSupportedInstitution(undefined), undefined);
});

test("merges provider institutions without duplicating built-in banks", () => {
  const merged = mergeInstitutions([
    { id: "abn-amro", name: "ABN AMRO Provider", country: "NL" },
    { id: "rabobank", name: "Rabobank", country: "NL" }
  ], "NL");
  assert.deepEqual(merged, [
    { id: "abn-amro", name: "ABN AMRO", country: "NL" },
    { id: "rabobank", name: "Rabobank", country: "NL" }
  ]);
  assert.equal(mergeInstitutions().length, 6);
});
