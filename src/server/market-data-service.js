import { MAX_QUOTE_SYMBOLS, normalizeQuote } from "../core/quotes.js";

const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30_000;
const SYMBOL_PATTERN = /^[A-Za-z0-9.\-]{1,16}$/;

function isoFromEpochSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : "";
}

export const PROVIDERS = Object.freeze({
  finnhub: Object.freeze({
    baseUrl: "https://finnhub.io/api/v1/",
    path: "quote",
    query: (apiKey, symbol) => ({ symbol, token: apiKey }),
    parse: (payload) => ({
      price: payload?.c,
      previousClose: payload?.pc,
      currency: "",
      asOf: isoFromEpochSeconds(payload?.t)
    })
  }),
  twelvedata: Object.freeze({
    baseUrl: "https://api.twelvedata.com/",
    path: "quote",
    query: (apiKey, symbol) => ({ symbol, apikey: apiKey }),
    parse: (payload) => ({
      price: payload?.close,
      previousClose: payload?.previous_close,
      currency: payload?.currency,
      asOf: isoFromEpochSeconds(payload?.timestamp)
    })
  })
});

export function marketDataProviderSettings(environment) {
  const apiKey = environment.MARKET_DATA_API_KEY;
  if (!apiKey) return null;
  const requested = String(environment.MARKET_DATA_PROVIDER || "finnhub").toLowerCase();
  const name = Object.hasOwn(PROVIDERS, requested) ? requested : "finnhub";
  const provider = PROVIDERS[name];
  return { apiKey, provider: name, baseUrl: environment.MARKET_DATA_API_URL || provider.baseUrl };
}

function endpoint(baseUrl, path) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== "https:") throw new TypeError("The market data API must use HTTPS.");
  return url;
}

export class MarketDataService {
  constructor(settings, request = fetch, now = () => Date.now()) {
    this.settings = settings;
    this.request = request;
    this.now = now;
    this.cache = new Map();
  }

  isConfigured() {
    return Boolean(this.settings);
  }

  async fetchQuote(symbol) {
    if (!this.isConfigured()) throw new Error("Market data is not configured.");
    if (!SYMBOL_PATTERN.test(symbol)) throw new TypeError("Invalid symbol.");
    const provider = PROVIDERS[this.settings.provider];
    const url = endpoint(this.settings.baseUrl, provider.path);
    for (const [key, value] of Object.entries(provider.query(this.settings.apiKey, symbol))) {
      url.searchParams.set(key, value);
    }
    const response = await this.request(url.href, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Market data request failed with status ${response.status}.`);
    const quote = normalizeQuote(provider.parse(await response.json()), symbol);
    if (!quote) throw new Error(`Market data for ${symbol} was malformed.`);
    return quote;
  }

  async quotes(symbols) {
    if (!this.isConfigured()) throw new Error("Market data is not configured.");
    const unique = [...new Set(symbols)].slice(0, MAX_QUOTE_SYMBOLS);
    const fresh = [];
    const pending = [];
    for (const symbol of unique) {
      const cached = this.cache.get(symbol);
      if (cached && cached.expiresAt > this.now()) fresh.push(cached.quote);
      else pending.push(symbol);
    }
    const results = await Promise.allSettled(pending.map((symbol) => this.fetchQuote(symbol)));
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      this.cache.set(result.value.symbol, { quote: result.value, expiresAt: this.now() + CACHE_TTL_MS });
      fresh.push(result.value);
    }
    return fresh;
  }
}

export function createMarketDataService(environment, request = fetch, now = () => Date.now()) {
  return new MarketDataService(marketDataProviderSettings(environment), request, now);
}
