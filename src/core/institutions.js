export const SUPPORTED_INSTITUTIONS = Object.freeze([
  Object.freeze({ id: "icici-bank", name: "ICICI Bank", country: "IN", bic: "ICICINBBNRI", rail: "IMPS" }),
  Object.freeze({ id: "hdfc-bank", name: "HDFC Bank", country: "IN", bic: "HDFCINBBXXX", rail: "IMPS" }),
  Object.freeze({ id: "state-bank-of-india", name: "State Bank of India", country: "IN", bic: "SBININBBXXX", rail: "IMPS" }),
  Object.freeze({ id: "aib", name: "Allied Irish Banks (AIB)", country: "IE", bic: "AIBKIE2DXXX", rail: "SEPA" }),
  Object.freeze({ id: "bank-of-ireland", name: "Bank of Ireland", country: "IE", bic: "BOFIIE2DXXX", rail: "SEPA" }),
  Object.freeze({ id: "abn-amro", name: "ABN AMRO", country: "NL", bic: "ABNANL2AXXX", rail: "SEPA" })
]);

export function listSupportedInstitutions(country = "") {
  const filter = String(country ?? "").slice(0, 2).toUpperCase();
  return SUPPORTED_INSTITUTIONS
    .filter((institution) => !filter || institution.country === filter)
    .map((institution) => ({ id: institution.id, name: institution.name, country: institution.country }));
}

export function getSupportedInstitution(id) {
  const identifier = String(id ?? "").toLowerCase();
  return SUPPORTED_INSTITUTIONS.find((institution) => institution.id === identifier);
}

export function mergeInstitutions(providerInstitutions = [], country = "") {
  const merged = new Map();
  for (const institution of listSupportedInstitutions(country)) merged.set(institution.id, institution);
  for (const institution of providerInstitutions) {
    if (!merged.has(institution.id)) merged.set(institution.id, institution);
  }
  return [...merged.values()];
}
