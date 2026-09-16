import { BASE_CURRENCY, convertAmount, exchangeRate, normalizeCurrency, normalizeRateTable } from "../core/fx.js";

const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

function isoFromEpochSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : "";
}

export const FX_PROVIDERS = Object.freeze({
  exchangerate: Object.freeze({
    baseUrl: "https://api.exchangerate.host/",
    path: "live",
    query: (apiKey, base, currencies) => ({
      access_key: apiKey,
      source: base,
      ...(currencies.length > 0 ? { currencies: currencies.join(",") } : {})
    }),
    parse: (payload, base) => ({
      base: payload?.source || base,
      asOf: isoFromEpochSeconds(payload?.timestamp),
      rates: Object.fromEntries(Object.entries(payload?.quotes ?? {})
        .map(([pair, value]) => [String(pair).slice(3), value]))
    })
  }),
  openexchangerates: Object.freeze({
    baseUrl: "https://openexchangerates.org/api/",
    path: "latest.json",
    query: (apiKey, base, currencies) => ({
      app_id: apiKey,
      base,
      ...(currencies.length > 0 ? { symbols: currencies.join(",") } : {})
    }),
    parse: (payload, base) => ({
      base: payload?.base || base,
      asOf: isoFromEpochSeconds(payload?.timestamp),
      rates: payload?.rates ?? {}
    })
  })
});

export function fxProviderSettings(environment) {
  const apiKey = environment.FX_RATES_API_KEY;
  if (!apiKey) return null;
  const requested = String(environment.FX_RATES_PROVIDER || "exchangerate").toLowerCase();
  const name = Object.hasOwn(FX_PROVIDERS, requested) ? requested : "exchangerate";
  const provider = FX_PROVIDERS[name];
  return {
    apiKey,
    provider: name,
    baseUrl: environment.FX_RATES_API_URL || provider.baseUrl,
    base: normalizeCurrency(environment.FX_RATES_BASE) || BASE_CURRENCY
  };
}

function endpoint(baseUrl, path) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== "https:") throw new TypeError("The exchange rate API must use HTTPS.");
  return url;
}

function hasCachedRates(cache, requested, now) {
  if (!cache || cache.expiresAt <= now) return false;
  if (requested.length === 0) return cache.requested.length === 0;
  return requested.every((currency) => Object.hasOwn(cache.table.rates, currency));
}

export class FxService {
  constructor(settings, request = fetch, now = () => Date.now()) {
    this.settings = settings;
    this.request = request;
    this.now = now;
    this.cache = null;
  }

  isConfigured() {
    return Boolean(this.settings);
  }

  async rates(currencies = []) {
    if (!this.isConfigured()) throw new Error("Exchange rates are not configured.");
    const requested = [...new Set(currencies.map((currency) => normalizeCurrency(currency)).filter(Boolean))];
    if (hasCachedRates(this.cache, requested, this.now())) return this.cache.table;
    const provider = FX_PROVIDERS[this.settings.provider];
    const url = endpoint(this.settings.baseUrl, provider.path);
    for (const [key, value] of Object.entries(provider.query(this.settings.apiKey, this.settings.base, requested))) {
      url.searchParams.set(key, value);
    }
    const response = await this.request(url.href, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Exchange rate request failed with status ${response.status}.`);
    const table = normalizeRateTable(provider.parse(await response.json(), this.settings.base), this.settings.base);
    if (!table || Object.keys(table.rates).length < 2) throw new Error("Exchange rates were malformed.");
    this.cache = { table, requested, expiresAt: this.now() + CACHE_TTL_MS };
    return table;
  }

  async convert(amount, from, to) {
    return convertAmount(amount, from, to, await this.rates([from, to]));
  }

  async rate(from, to) {
    return exchangeRate(from, to, await this.rates([from, to]));
  }
}

export function createFxService(environment, request = fetch, now = () => Date.now()) {
  return new FxService(fxProviderSettings(environment), request, now);
}
