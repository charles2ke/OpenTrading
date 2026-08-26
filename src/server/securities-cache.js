const IDENTIFIER_KEYS = Object.freeze(["symbol", "ticker", "isin", "cusip", "sedol"]);

function normalizeIdentifier(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeType(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export class SecuritiesCache {
  constructor(securities) {
    this.securities = Object.freeze(securities.map((security) => Object.freeze({ ...security })));
    this.byIdentifier = new Map();
    for (const security of this.securities) {
      for (const key of IDENTIFIER_KEYS) {
        const value = normalizeIdentifier(security[key]);
        if (value) this.byIdentifier.set(`${key}:${value}`, security);
      }
    }
  }

  list() {
    return this.securities;
  }

  findByIdentifier(type, value) {
    const normalizedType = normalizeType(type);
    if (!IDENTIFIER_KEYS.includes(normalizedType)) return null;
    const normalizedValue = normalizeIdentifier(value);
    if (!normalizedValue) return null;
    return this.byIdentifier.get(`${normalizedType}:${normalizedValue}`) ?? null;
  }
}

export function createSecuritiesCache(securities) {
  return new SecuritiesCache(securities);
}
