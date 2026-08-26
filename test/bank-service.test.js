import assert from "node:assert/strict";
import test from "node:test";
import { BankService, bankProviderSettings, createBankService } from "../src/server/bank-service.js";

const IBAN = "DE89370400440532013000";
const BIC = "COBADEFFXXX";
const environment = { OPEN_BANKING_API_URL: "https://api.example.com/v1", OPEN_BANKING_API_KEY: "key-123", OPEN_BANKING_REDIRECT_URI: "https://app.example.com/banking" };

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

test("provider settings require a base URL and API key", () => {
  assert.equal(bankProviderSettings({}), null);
  assert.equal(bankProviderSettings({ OPEN_BANKING_API_URL: "https://api.example.com" }), null);
  assert.equal(bankProviderSettings({ OPEN_BANKING_API_KEY: "key" }), null);
  assert.deepEqual(bankProviderSettings(environment), { baseUrl: environment.OPEN_BANKING_API_URL, apiKey: "key-123", redirectUri: environment.OPEN_BANKING_REDIRECT_URI });
  assert.equal(bankProviderSettings({ ...environment, OPEN_BANKING_REDIRECT_URI: undefined }).redirectUri, "");
});

test("an unconfigured service refuses to call the provider", async () => {
  const service = createBankService({});
  assert.equal(service.isConfigured(), false);
  await assert.rejects(service.listInstitutions(), /not configured/);
});

test("lists institutions for a country and authenticates the request", async () => {
  const { request, calls } = stubRequest({
    "/v1/institutions": jsonResponse({
      institutions: [
        { id: "commerzbank", name: "Commerzbank", country: "de" },
        { id: "", name: "Broken" },
        { name: "Nameless" },
        { id: "unnamed" }
      ]
    })
  });
  const service = createBankService(environment, request);
  assert.deepEqual(await service.listInstitutions("de"), [{ id: "commerzbank", name: "Commerzbank", country: "DE" }]);
  assert.equal(calls[0].url, "https://api.example.com/v1/institutions?country=DE");
  assert.equal(calls[0].options.headers.Authorization, "Bearer " + environment.OPEN_BANKING_API_KEY);

  await service.listInstitutions();
  assert.equal(calls[1].url, "https://api.example.com/v1/institutions");
});

test("normalizes an empty institutions payload", async () => {
  const { request } = stubRequest({ "/v1/institutions": jsonResponse({}) });
  assert.deepEqual(await createBankService(environment, request).listInstitutions(), []);
});

test("rejects non-HTTPS providers and failed responses", async () => {
  const insecure = new BankService({ baseUrl: "http://api.example.com/", apiKey: "key", redirectUri: "" }, stubRequest({}).request);
  await assert.rejects(insecure.listInstitutions(), /HTTPS/);

  const { request } = stubRequest({ "/v1/institutions": () => ({ ok: false, status: 502 }) });
  await assert.rejects(createBankService(environment, request).listInstitutions(), /status 502/);
});

test("creates a bank connection and returns only a safe consent URL", async () => {
  const { request, calls } = stubRequest({
    "/v1/connections": jsonResponse({ id: "conn-1", status: "pending", consentUrl: "https://bank.example.com/consent", institutionId: "commerzbank" })
  });
  const service = new BankService(bankProviderSettings(environment), request, () => "reference-1");
  assert.deepEqual(await service.createConnection("commerzbank"), {
    id: "conn-1",
    status: "pending",
    consentUrl: "https://bank.example.com/consent",
    institutionId: "commerzbank"
  });
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    institutionId: "commerzbank",
    reference: "reference-1",
    scopes: ["accounts:read", "payments:initiate"],
    redirectUri: environment.OPEN_BANKING_REDIRECT_URI
  });

  const unsafe = stubRequest({ "/v1/connections": jsonResponse({ id: "conn-2", status: "linked", consentUrl: "javascript:alert(1)" }) });
  const linked = await new BankService(bankProviderSettings(environment), unsafe.request, () => "reference-2").createConnection("commerzbank");
  assert.deepEqual(linked, { id: "conn-2", status: "linked", consentUrl: "", institutionId: "commerzbank" });

  const missing = stubRequest({ "/v1/connections": jsonResponse({}) });
  const fallback = await new BankService(bankProviderSettings(environment), missing.request, () => "reference-3").createConnection("commerzbank");
  assert.deepEqual(fallback, { id: "", status: "pending", consentUrl: "", institutionId: "commerzbank" });

  await assert.rejects(service.createConnection("bad id!"), /Invalid institution/);
  await assert.rejects(service.createConnection(undefined), /Invalid institution/);
});

test("lists sanitized accounts and drops unusable records", async () => {
  const { request } = stubRequest({
    "/v1/connections/conn-1/accounts": jsonResponse({
      accounts: [
        { id: "acc-1", name: "Everyday", bank: "Commerzbank", iban: IBAN, bic: BIC, currency: "EUR", balance: 2500 },
        { id: "acc-2", name: "Broken", iban: "nope", bic: BIC, currency: "EUR", balance: 1 }
      ]
    })
  });
  const service = createBankService(environment, request);
  const accounts = await service.listAccounts("conn-1");
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].maskedIban, "DE••••3000");
  await assert.rejects(service.listAccounts("../secrets"), /Invalid connection/);

  const { request: emptyRequest } = stubRequest({ "/v1/connections/conn-1/accounts": jsonResponse({}) });
  assert.deepEqual(await createBankService(environment, emptyRequest).listAccounts("conn-1"), []);
});

test("initiates transfers as ISO 20022 instructions", async () => {
  const { request, calls } = stubRequest({ "/v1/connections/conn-1/payments": jsonResponse({ status: "settled", paymentId: "pay-1" }) });
  const service = new BankService(bankProviderSettings(environment), request, () => "identifier-1");
  const portfolio = { cash: 1000, positions: {} };
  const transfer = { direction: "deposit", amount: 100, currency: "EUR", iban: IBAN, bic: BIC, accountName: "Ada Lovelace" };

  const result = await service.initiateTransfer("conn-1", portfolio, transfer);
  assert.equal(result.error, "");
  assert.equal(result.status, "settled");
  assert.equal(result.paymentId, "pay-1");
  assert.equal(result.instruction.scheme, "SEPA");
  assert.equal(JSON.parse(calls[0].options.body).instruction.amount.minorUnits, 10_000);

  const rejected = await service.initiateTransfer("conn-1", portfolio, { ...transfer, iban: "invalid" });
  assert.deepEqual(rejected, { error: "Enter a valid IBAN.", instruction: null, status: "rejected" });

  const pending = stubRequest({ "/v1/connections/conn-1/payments": jsonResponse({}) });
  const pendingResult = await new BankService(bankProviderSettings(environment), pending.request, () => "identifier-2").initiateTransfer("conn-1", portfolio, transfer);
  assert.equal(pendingResult.status, "pending");
  assert.equal(pendingResult.paymentId, "identifier-2");
});

test("uses a random identifier by default", async () => {
  const { request, calls } = stubRequest({ "/v1/connections": jsonResponse({ id: "conn-9", status: "pending" }) });
  await createBankService(environment, request).createConnection("commerzbank");
  assert.match(JSON.parse(calls[0].options.body).reference, /^[0-9a-f-]{36}$/i);
});

test("falls back to the global fetch implementation", () => {
  assert.equal(new BankService(null).request, fetch);
});
