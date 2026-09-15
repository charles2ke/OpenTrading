import assert from "node:assert/strict";
import test from "node:test";
import { FxService, createFxService, fxProviderSettings } from "../src/server/fx-service.js";

const environment = { FX_RATES_API_KEY: "key-123" };

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
  assert.equal(fxProviderSettings({}), null);
  assert.deepEqual(fxProviderSettings(environment), {
    apiKey: "key-123",
    provider: "exchangerate",
    baseUrl: "https://api.exchangerate.host/",
    base: "USD"
  });
  assert.equal(fxProviderSettings({ ...environment, FX_RATES_PROVIDER: "OpenExchangeRates" }).baseUrl, "https://openexchangerates.org/api/");
  assert.equal(fxProviderSettings({ ...environment, FX_RATES_PROVIDER: "unknown" }).provider, "exchangerate");
  assert.equal(fxProviderSettings({ ...environment, FX_RATES_API_URL: "https://proxy.example.com/v1" }).baseUrl, "https://proxy.example.com/v1");
  assert.equal(fxProviderSettings({ ...environment, FX_RATES_BASE: "eur" }).base, "EUR");
  assert.equal(fxProviderSettings({ ...environment, FX_RATES_BASE: "euro" }).base, "USD");
});

test("an unconfigured service refuses to fetch rates", async () => {
  const service = createFxService({});
  assert.equal(service.isConfigured(), false);
  await assert.rejects(service.rates(["EUR"]), /not configured/);
  await assert.rejects(service.convert(10, "EUR", "USD"), /not configured/);
  await assert.rejects(service.rate("EUR", "USD"), /not configured/);
});

test("fetches and normalizes exchangerate.host quotes", async () => {
  const { request, calls } = stubRequest(() => jsonResponse({ source: "USD", timestamp: 1767603600, quotes: { USDEUR: 0.9, USDJPY: 150 } }));
  const service = createFxService(environment, request);
  const table = await service.rates(["eur", "EUR", "", "JPY"]);
  assert.deepEqual(table, { base: "USD", asOf: "2026-01-05T09:00:00.000Z", rates: { USD: 1, EUR: 0.9, JPY: 150 } });
  assert.equal(calls[0].url, "https://api.exchangerate.host/live?access_key=key-123&source=USD&currencies=EUR%2CJPY");
  assert.equal(calls[0].options.headers.Accept, "application/json");
});

test("fetches Open Exchange Rates from a proxy base URL", async () => {
  const { request, calls } = stubRequest(() => jsonResponse({ timestamp: 0, rates: { EUR: "0.9", GBP: 0.8 } }));
  const service = createFxService({
    ...environment,
    FX_RATES_PROVIDER: "openexchangerates",
    FX_RATES_API_URL: "https://proxy.example.com/v1"
  }, request);
  const table = await service.rates(["EUR", "GBP"]);
  assert.deepEqual(table.rates, { USD: 1, EUR: 0.9, GBP: 0.8 });
  assert.ok(!Number.isNaN(Date.parse(table.asOf)));
  assert.equal(calls[0].url, "https://proxy.example.com/v1/latest.json?app_id=key-123&base=USD&symbols=EUR%2CGBP");
});

test("converts amounts and exposes raw rates from one cached response", async () => {
  let responses = 0;
  const { request } = stubRequest(() => {
    responses += 1;
    return jsonResponse({ source: "USD", timestamp: 1767603600, quotes: { USDJPY: 150 } });
  });
  let clock = 0;
  const service = createFxService(environment, request, () => clock);
  assert.equal(await service.convert(15_000, "JPY", "USD"), 100);
  assert.equal(await service.rate("JPY", "USD"), 1 / 150);
  assert.equal(responses, 1);
  clock = 10 * 60 * 1000 + 1;
  assert.equal(await service.convert(15_000, "JPY", "USD"), 100);
  assert.equal(responses, 2);
});

test("rejects insecure base URLs, failed requests, and malformed payloads", async () => {
  const insecure = new FxService({ apiKey: "key", provider: "exchangerate", baseUrl: "http://rates.example.com", base: "USD" });
  await assert.rejects(insecure.rates(), /HTTPS/);
  const failing = createFxService(environment, async () => ({ ok: false, status: 429 }));
  await assert.rejects(failing.rates(), /status 429/);
  const malformed = createFxService(environment, async () => jsonResponse({ source: "USD", quotes: {} }));
  await assert.rejects(malformed.rates(), /malformed/);
});

test("falls back to provider payload defaults, the global fetch, and the clock", async () => {
  const service = new FxService(null);
  assert.equal(service.request, fetch);
  assert.equal(typeof service.now(), "number");

  const missingBase = createFxService(environment, async () => jsonResponse({ timestamp: 1767603600, quotes: { USDEUR: 0.9 } }));
  assert.equal((await missingBase.rates()).base, "USD");
  const emptyPayload = createFxService({ ...environment, FX_RATES_PROVIDER: "openexchangerates" }, async () => jsonResponse({ base: "USD" }));
  await assert.rejects(emptyPayload.rates(), /malformed/);
  const emptyQuotes = createFxService(environment, async () => jsonResponse({ source: "USD" }));
  await assert.rejects(emptyQuotes.rates(), /malformed/);
});
