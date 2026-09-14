import assert from "node:assert/strict";
import test from "node:test";
import { MarketDataService, createMarketDataService, marketDataProviderSettings } from "../src/server/market-data-service.js";

const environment = { MARKET_DATA_API_KEY: "key-123" };

function stubRequest(handler) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return handler(new URL(url), options);
  };
  return { request, calls };
}

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

test("provider settings require an API key and select a known provider", () => {
  assert.equal(marketDataProviderSettings({}), null);
  assert.deepEqual(marketDataProviderSettings(environment), {
    apiKey: "key-123",
    provider: "finnhub",
    baseUrl: "https://finnhub.io/api/v1/"
  });
  assert.equal(marketDataProviderSettings({ ...environment, MARKET_DATA_PROVIDER: "TwelveData" }).baseUrl, "https://api.twelvedata.com/");
  assert.equal(marketDataProviderSettings({ ...environment, MARKET_DATA_PROVIDER: "unknown" }).provider, "finnhub");
  assert.equal(marketDataProviderSettings({ ...environment, MARKET_DATA_API_URL: "https://proxy.example.com/v1" }).baseUrl, "https://proxy.example.com/v1");
});

test("an unconfigured service refuses to fetch quotes", async () => {
  const service = createMarketDataService({});
  assert.equal(service.isConfigured(), false);
  await assert.rejects(service.quotes(["AAPL"]), /not configured/);
  await assert.rejects(service.fetchQuote("AAPL"), /not configured/);
});

test("fetches and normalizes a Finnhub quote", async () => {
  const { request, calls } = stubRequest(() => jsonResponse({ c: 240.5, pc: 238, t: 1767603600 }));
  const service = createMarketDataService(environment, request);
  const [quote] = await service.quotes(["AAPL"]);
  assert.deepEqual(quote, {
    symbol: "AAPL",
    price: 240.5,
    previousClose: 238,
    currency: "",
    asOf: "2026-01-05T09:00:00.000Z"
  });
  assert.equal(calls[0].url, "https://finnhub.io/api/v1/quote?symbol=AAPL&token=key-123");
  assert.equal(calls[0].options.headers.Accept, "application/json");
});

test("fetches and normalizes a Twelve Data quote from a proxy base URL", async () => {
  const { request, calls } = stubRequest(() => jsonResponse({ close: "13.76", previous_close: "13.59", currency: "gbp", timestamp: 0 }));
  const service = createMarketDataService({
    ...environment,
    MARKET_DATA_PROVIDER: "twelvedata",
    MARKET_DATA_API_URL: "https://proxy.example.com/v1"
  }, request);
  const [quote] = await service.quotes(["HSBA"]);
  assert.equal(quote.price, 13.76);
  assert.equal(quote.currency, "GBP");
  assert.ok(!Number.isNaN(Date.parse(quote.asOf)));
  assert.equal(calls[0].url, "https://proxy.example.com/v1/quote?symbol=HSBA&apikey=key-123");
});

test("caches quotes until the cache expires", async () => {
  const { request, calls } = stubRequest(() => jsonResponse({ c: 100, pc: 99, t: 1767603600 }));
  let clock = 0;
  const service = createMarketDataService(environment, request, () => clock);
  await service.quotes(["AAPL"]);
  const cached = await service.quotes(["AAPL"]);
  assert.equal(calls.length, 1);
  assert.equal(cached[0].price, 100);
  clock = 60_000;
  await service.quotes(["AAPL"]);
  assert.equal(calls.length, 2);
});

test("drops failing symbols without failing the batch", async () => {
  const { request } = stubRequest((url) => url.searchParams.get("symbol") === "AAPL"
    ? jsonResponse({ c: 100, pc: 99, t: 1767603600 })
    : { ok: false, status: 429 });
  const service = createMarketDataService(environment, request);
  const quotes = await service.quotes(["AAPL", "AAPL", "MSFT"]);
  assert.deepEqual(quotes.map((quote) => quote.symbol), ["AAPL"]);
});

test("rejects malformed payloads, invalid symbols, and non-HTTPS endpoints", async () => {
  const { request } = stubRequest(() => jsonResponse({ c: null }));
  await assert.rejects(createMarketDataService(environment, request).fetchQuote("AAPL"), /malformed/);
  await assert.rejects(createMarketDataService(environment, request).fetchQuote("AA PL"), /Invalid symbol/);

  const insecure = new MarketDataService(
    { apiKey: "key", provider: "finnhub", baseUrl: "http://finnhub.io/api/v1/" },
    stubRequest(() => jsonResponse({})).request
  );
  await assert.rejects(insecure.fetchQuote("AAPL"), /HTTPS/);
});

test("falls back to the global fetch implementation and clock", () => {
  const service = new MarketDataService(null);
  assert.equal(service.request, fetch);
  assert.equal(typeof service.now(), "number");
});
