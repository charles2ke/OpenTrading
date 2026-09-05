import assert from "node:assert/strict";
import test from "node:test";
import { BrokerService, brokerProviderSettings, createBrokerService } from "../src/server/broker-service.js";

const environment = { TRADING212_API_KEY: "key-123" };

function stubRequest(handlers) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    const handler = handlers[new URL(url).pathname] ?? (() => ({ ok: false, status: 500 }));
    return handler(url, options);
  };
  return { request, calls };
}

function jsonResponse(body) {
  return () => ({ ok: true, status: 200, json: async () => body });
}

function stubTrading212() {
  return stubRequest({
    "/api/v0/equity/account/info": jsonResponse({ currencyCode: "GBP" }),
    "/api/v0/equity/account/cash": jsonResponse({ free: 500, invested: 200, total: 700, ppl: 12 }),
    "/api/v0/equity/portfolio": jsonResponse([{ ticker: "AAPL_US_EQ", quantity: 2, averagePrice: 100, currentPrice: 110, ppl: 20 }])
  });
}

test("provider settings require an API key and select the environment", () => {
  assert.equal(brokerProviderSettings({}), null);
  assert.deepEqual(brokerProviderSettings(environment), { apiKey: "key-123", baseUrl: "https://live.trading212.com/api/v0/" });
  assert.equal(brokerProviderSettings({ ...environment, TRADING212_ENVIRONMENT: "DEMO" }).baseUrl, "https://demo.trading212.com/api/v0/");
  assert.equal(brokerProviderSettings({ ...environment, TRADING212_ENVIRONMENT: "sandbox" }).baseUrl, "https://live.trading212.com/api/v0/");
  assert.equal(brokerProviderSettings({ ...environment, TRADING212_API_URL: "https://proxy.example.com/v0" }).baseUrl, "https://proxy.example.com/v0");
});

test("an unconfigured service refuses to call Trading 212", async () => {
  const service = createBrokerService({});
  assert.equal(service.isConfigured(), false);
  await assert.rejects(service.summary(), /not configured/);
});

test("summarizes the Trading 212 account and authenticates the request", async () => {
  const { request, calls } = stubTrading212();
  const service = createBrokerService(environment, request);
  const summary = await service.summary();
  assert.equal(summary.currency, "GBP");
  assert.equal(summary.cash, 500);
  assert.equal(summary.accountValue, 720);
  assert.deepEqual(summary.positions.map((position) => position.symbol), ["AAPL_US_EQ"]);
  assert.equal(calls[0].options.headers.Authorization, "key-123");
  assert.equal(calls[0].url, "https://live.trading212.com/api/v0/equity/account/info");
});

test("caches the summary until the cache expires", async () => {
  const { request, calls } = stubTrading212();
  let clock = 0;
  const service = createBrokerService(environment, request, () => clock);
  await service.summary();
  await service.summary();
  assert.equal(calls.length, 3);
  clock = 60_000;
  await service.summary();
  assert.equal(calls.length, 6);
});

test("supports a proxy base URL without a trailing slash and a missing account currency", async () => {
  const { request, calls } = stubRequest({
    "/v0/equity/account/info": jsonResponse(null),
    "/v0/equity/account/cash": jsonResponse({ free: 10 }),
    "/v0/equity/portfolio": jsonResponse([])
  });
  const service = createBrokerService({ ...environment, TRADING212_API_URL: "https://proxy.example.com/v0" }, request);
  const summary = await service.summary();
  assert.equal(summary.currency, "");
  assert.equal(summary.accountValue, 10);
  assert.equal(calls[0].url, "https://proxy.example.com/v0/equity/account/info");
});

test("rejects non-HTTPS endpoints and failed responses", async () => {
  const insecure = new BrokerService({ apiKey: "key", baseUrl: "http://live.trading212.com/api/v0/" }, stubRequest({}).request);
  await assert.rejects(insecure.summary(), /HTTPS/);

  const { request } = stubRequest({ "/api/v0/equity/account/info": () => ({ ok: false, status: 429 }) });
  await assert.rejects(createBrokerService(environment, request).summary(), /status 429/);
});

test("falls back to the global fetch implementation and clock", async () => {
  const service = new BrokerService(null);
  assert.equal(service.request, fetch);
  assert.equal(typeof service.now(), "number");
});
