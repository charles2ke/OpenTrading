import assert from "node:assert/strict";
import test from "node:test";
import { AuthService, parseSessionId, providerSettings, sessionCookie } from "../src/server/auth.js";

function store(overrides = {}) {
  return {
    saveState: async () => {},
    consumeState: async () => null,
    saveSession: async () => {},
    findSession: async () => null,
    deleteSession: async () => {},
    ...overrides
  };
}

function client(claims = { sub: "123", name: "Ada", email: "ada@example.com" }) {
  return {
    discovery: async () => ({ configured: true }),
    randomPKCECodeVerifier: () => "verifier",
    calculatePKCECodeChallenge: async () => "challenge",
    randomState: () => "state",
    buildAuthorizationUrl: (_config, parameters) => new URL(`https://identity.example/authorize?${new URLSearchParams(parameters)}`),
    authorizationCodeGrant: async () => ({ claims: () => claims })
  };
}

const providers = {
  google: { issuer: "https://accounts.google.com", clientId: "id", clientSecret: "secret" },
  microsoft: null
};

test("parses and serializes hardened session cookies", () => {
  assert.equal(parseSessionId(), "");
  assert.equal(parseSessionId("other=x; __Host-opentrading=session%20id"), "session id");
  assert.match(sessionCookie("session"), /HttpOnly; Secure; SameSite=Lax/);
  assert.match(sessionCookie("", 0), /Max-Age=0/);
});

test("configures available identity providers", () => {
  assert.deepEqual(providerSettings({}), { google: null, microsoft: null });
  assert.equal(providerSettings({ GOOGLE_CLIENT_ID: "id" }).google, null);
  assert.equal(providerSettings({ MICROSOFT_CLIENT_ID: "id" }).microsoft, null);
  const settings = providerSettings({
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
    MICROSOFT_CLIENT_ID: "ms-id",
    MICROSOFT_CLIENT_SECRET: "ms-secret"
  });
  assert.equal(settings.google.clientId, "google-id");
  assert.match(settings.microsoft.issuer, /common/);
  assert.match(providerSettings({
    MICROSOFT_CLIENT_ID: "id",
    MICROSOFT_CLIENT_SECRET: "secret",
    MICROSOFT_TENANT_ID: "tenant"
  }).microsoft.issuer, /tenant/);
});

test("starts login with cached discovery, PKCE, and state", async () => {
  const saved = [];
  let discoveryCount = 0;
  const fakeClient = client();
  fakeClient.discovery = async () => {
    discoveryCount += 1;
    return {};
  };
  const service = new AuthService(store({ saveState: async (...args) => saved.push(args) }), "https://app.example/", providers, fakeClient);
  const redirect = await service.begin("google");
  assert.equal(redirect.searchParams.get("code_challenge"), "challenge");
  assert.equal(redirect.searchParams.get("state"), "state");
  assert.equal(saved[0][0], "state");
  await service.configuration("google");
  assert.equal(discoveryCount, 1);
  await assert.rejects(() => service.begin("microsoft"), /not configured/);
});

test("completes login and creates a session", async () => {
  let saved;
  const service = new AuthService(store({
    consumeState: async () => ({ provider: "google", codeVerifier: "verifier", expiresAt: new Date(Date.now() + 1000) }),
    saveSession: async (...args) => { saved = args; }
  }), "https://app.example", providers, client());
  const result = await service.complete("google", new URL("https://app.example/auth/google/callback?state=state&code=code"));
  assert.match(result.sessionId, /^[\w-]{43}$/);
  assert.deepEqual(result.user, { id: "google:123", name: "Ada", provider: "google" });
  assert.equal(saved[1].user.id, "google:123");
});

test("rejects invalid callbacks and identity claims", async () => {
  const url = new URL("https://app.example/auth/google/callback?state=state");
  const missing = new AuthService(store(), "https://app.example", providers, client());
  await assert.rejects(() => missing.complete("google", url), /Invalid or expired/);
  await assert.rejects(() => missing.complete("google", new URL("https://app.example/callback")), /Invalid or expired/);
  const wrong = new AuthService(store({ consumeState: async () => ({ provider: "microsoft", expiresAt: new Date(Date.now() + 1000) }) }), "https://app.example", providers, client());
  await assert.rejects(() => wrong.complete("google", url), /Invalid or expired/);
  const expired = new AuthService(store({ consumeState: async () => ({ provider: "google", expiresAt: new Date(0) }) }), "https://app.example", providers, client());
  await assert.rejects(() => expired.complete("google", url), /Invalid or expired/);
  const noSubject = new AuthService(store({ consumeState: async () => ({ provider: "google", codeVerifier: "v", expiresAt: new Date(Date.now() + 1000) }) }), "https://app.example", providers, client({}));
  await assert.rejects(() => noSubject.complete("google", url), /did not contain a subject/);
});

test("normalizes fallback claims and manages current sessions", async () => {
  let deleted = "";
  const fakeStore = store({
    consumeState: async () => ({ provider: "google", codeVerifier: "v", expiresAt: new Date(Date.now() + 1000) }),
    findSession: async (id) => id === "valid" ? { user: { id: "google:1" } } : null,
    deleteSession: async (id) => { deleted = id; }
  });
  const service = new AuthService(fakeStore, "https://app.example", providers, client({ sub: "1", email: "e".repeat(300) }));
  const result = await service.complete("google", new URL("https://app.example/callback?state=state"));
  assert.equal(result.user.name.length, 100);
  const anonymousClaims = new AuthService(fakeStore, "https://app.example", providers, client({ sub: "2" }));
  const anonymousResult = await anonymousClaims.complete("google", new URL("https://app.example/callback?state=state"));
  assert.equal(anonymousResult.user.name, "Trader");
  assert.equal(anonymousResult.user.email, "");
  assert.equal(await service.current(), null);
  assert.deepEqual(await service.current("__Host-opentrading=valid"), { id: "google:1" });
  assert.equal(await service.current("__Host-opentrading=missing"), null);
  await service.logout();
  await service.logout("__Host-opentrading=valid");
  assert.equal(deleted, "valid");
});
