import { randomBytes } from "node:crypto";
import * as oidc from "openid-client";

const SESSION_COOKIE = "__Host-opentrading";
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const STATE_LIFETIME_MS = 10 * 60 * 1000;

export function parseSessionId(cookie = "") {
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return value ? decodeURIComponent(value.slice(SESSION_COOKIE.length + 1)) : "";
}

export function sessionCookie(id, maxAge = SESSION_LIFETIME_MS / 1000) {
  return `${SESSION_COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function providerSettings(environment) {
  return {
    google: environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET ? {
      issuer: "https://accounts.google.com",
      clientId: environment.GOOGLE_CLIENT_ID,
      clientSecret: environment.GOOGLE_CLIENT_SECRET
    } : null,
    microsoft: environment.MICROSOFT_CLIENT_ID && environment.MICROSOFT_CLIENT_SECRET ? {
      issuer: `https://login.microsoftonline.com/${environment.MICROSOFT_TENANT_ID || "common"}/v2.0`,
      clientId: environment.MICROSOFT_CLIENT_ID,
      clientSecret: environment.MICROSOFT_CLIENT_SECRET
    } : null
  };
}

export class AuthService {
  constructor(store, baseUrl, providers, client = oidc) {
    this.store = store;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.providers = providers;
    this.client = client;
    this.configurations = new Map();
  }

  async configuration(provider) {
    if (!this.providers[provider]) throw new Error("Authentication provider is not configured.");
    if (!this.configurations.has(provider)) {
      const settings = this.providers[provider];
      this.configurations.set(provider, this.client.discovery(
        new URL(settings.issuer),
        settings.clientId,
        settings.clientSecret
      ));
    }
    return this.configurations.get(provider);
  }

  async begin(provider) {
    const configuration = await this.configuration(provider);
    const codeVerifier = this.client.randomPKCECodeVerifier();
    const codeChallenge = await this.client.calculatePKCECodeChallenge(codeVerifier);
    const state = this.client.randomState();
    await this.store.saveState(state, {
      provider,
      codeVerifier,
      expiresAt: new Date(Date.now() + STATE_LIFETIME_MS)
    });
    return this.client.buildAuthorizationUrl(configuration, {
      redirect_uri: `${this.baseUrl}/auth/${provider}/callback`,
      scope: "openid email profile",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state
    });
  }

  async complete(provider, currentUrl) {
    const state = currentUrl.searchParams.get("state") || "";
    const pending = await this.store.consumeState(state);
    if (!pending || pending.provider !== provider || pending.expiresAt <= new Date()) throw new Error("Invalid or expired authentication state.");
    const configuration = await this.configuration(provider);
    const tokens = await this.client.authorizationCodeGrant(configuration, currentUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: state
    });
    const claims = tokens.claims();
    if (!claims?.sub) throw new Error("Identity token did not contain a subject.");
    const sessionId = randomBytes(32).toString("base64url");
    const user = {
      id: `${provider}:${claims.sub}`,
      name: String(claims.name || "Trader").slice(0, 100),
      provider
    };
    await this.store.saveSession(sessionId, { user, expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) });
    return { sessionId, user };
  }

  async current(cookie) {
    const sessionId = parseSessionId(cookie);
    if (!sessionId) return null;
    const session = await this.store.findSession(sessionId);
    return session?.user ?? null;
  }

  async logout(cookie) {
    const sessionId = parseSessionId(cookie);
    if (sessionId) await this.store.deleteSession(sessionId);
  }
}
