import { normalizeBrokerCash, summarizeBrokerAccount } from "../core/brokerage.js";

const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30_000;
const ENVIRONMENT_URLS = Object.freeze({
  live: "https://live.trading212.com/api/v0/",
  demo: "https://demo.trading212.com/api/v0/"
});

export function brokerProviderSettings(environment) {
  const apiKey = environment.TRADING212_API_KEY;
  if (!apiKey) return null;
  const mode = String(environment.TRADING212_ENVIRONMENT || "live").toLowerCase();
  const baseUrl = environment.TRADING212_API_URL || ENVIRONMENT_URLS[mode] || ENVIRONMENT_URLS.live;
  return { apiKey, baseUrl };
}

function endpoint(baseUrl, path) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== "https:") throw new TypeError("The Trading 212 API must use HTTPS.");
  return url;
}

export class BrokerService {
  constructor(settings, request = fetch, now = () => Date.now()) {
    this.settings = settings;
    this.request = request;
    this.now = now;
    this.cache = null;
  }

  isConfigured() {
    return Boolean(this.settings);
  }

  async call(path) {
    if (!this.isConfigured()) throw new Error("Trading 212 is not configured.");
    const response = await this.request(endpoint(this.settings.baseUrl, path).href, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: this.settings.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Trading 212 request failed with status ${response.status}.`);
    return response.json();
  }

  async summary() {
    if (this.cache && this.cache.expiresAt > this.now()) return this.cache.summary;
    const [info, cash, portfolio] = await Promise.all([
      this.call("equity/account/info"),
      this.call("equity/account/cash"),
      this.call("equity/portfolio")
    ]);
    const summary = summarizeBrokerAccount(normalizeBrokerCash(cash, info?.currencyCode), portfolio);
    this.cache = { summary, expiresAt: this.now() + CACHE_TTL_MS };
    return summary;
  }
}

export function createBrokerService(environment, request = fetch, now = () => Date.now()) {
  return new BrokerService(brokerProviderSettings(environment), request, now);
}
