import { DATA_AS_OF, DATA_PROVIDER, DATA_SOURCE } from "./dataset.js";

export const CALCULATION_VERSION = "1.0.0";

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

export function createReport({
  title,
  module,
  symbol = null,
  assumptions = {},
  results = {},
  narrative = [],
  modelVersion = null,
  createdAt = DATA_AS_OF
} = {}) {
  const label = String(title ?? "").trim();
  if (label === "") throw new TypeError("A report needs a title.");
  if (String(module ?? "").trim() === "") throw new TypeError("A report needs a module.");
  return deepFreeze({
    id: `${module}:${symbol ?? "portfolio"}:${createdAt}`,
    title: label,
    module,
    symbol,
    createdAt,
    calculationVersion: CALCULATION_VERSION,
    modelVersion,
    dataSnapshot: { provider: DATA_PROVIDER, source: DATA_SOURCE, asOf: DATA_AS_OF },
    assumptions: structuredClone(assumptions),
    results: structuredClone(results),
    narrative: [...narrative]
  });
}

export function listReports(reports, { module = null, symbol = null } = {}) {
  return (reports ?? [])
    .filter((report) => (module === null || report.module === module) && (symbol === null || report.symbol === symbol))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function flatten(value, prefix = "") {
  if (value === null || typeof value !== "object") return [[prefix, value]];
  return Object.entries(value).flatMap(([key, entry]) => flatten(entry, prefix === "" ? key : `${prefix}.${key}`));
}

export function reportToCsv(report) {
  const rows = [
    ["field", "value"],
    ["title", report.title],
    ["module", report.module],
    ["symbol", report.symbol ?? ""],
    ["createdAt", report.createdAt],
    ["calculationVersion", report.calculationVersion],
    ["dataSource", `${report.dataSnapshot.provider} / ${report.dataSnapshot.source} @ ${report.dataSnapshot.asOf}`],
    ...flatten(report.assumptions, "assumptions"),
    ...flatten(report.results, "results")
  ];
  return rows
    .map((row) => row
      .map((cell) => (/[",\n]/.test(String(cell ?? "")) ? `"${String(cell).replaceAll('"', '""')}"` : String(cell ?? "")))
      .join(","))
    .join("\n");
}

export function reportToPrintable(report) {
  return [
    `# ${report.title}`,
    `Module: ${report.module}`,
    `Security: ${report.symbol ?? "Portfolio"}`,
    `Generated: ${report.createdAt}`,
    `Data: ${report.dataSnapshot.provider} (${report.dataSnapshot.source}) as of ${report.dataSnapshot.asOf}`,
    `Calculation version: ${report.calculationVersion}`,
    report.modelVersion === null ? "Model: none (deterministic calculations only)" : `Model: ${report.modelVersion}`,
    "",
    ...report.narrative
  ].join("\n");
}
