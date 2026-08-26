import { buildPaymentInstruction, sanitizeBankAccount, validateTransfer } from "../core/banking.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const REQUEST_TIMEOUT_MS = 10_000;

export function bankProviderSettings(environment) {
  const baseUrl = environment.OPEN_BANKING_API_URL;
  const apiKey = environment.OPEN_BANKING_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey, redirectUri: environment.OPEN_BANKING_REDIRECT_URI || "" };
}

function assertIdentifier(value, label) {
  if (!IDENTIFIER_PATTERN.test(String(value ?? ""))) throw new TypeError(`Invalid ${label}.`);
  return String(value);
}

function endpoint(baseUrl, path) {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== "https:") throw new TypeError("The Open Banking API must use HTTPS.");
  return url;
}

function safeConsentUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export class BankService {
  constructor(settings, request = fetch, randomId = () => crypto.randomUUID()) {
    this.settings = settings;
    this.request = request;
    this.randomId = randomId;
  }

  isConfigured() {
    return Boolean(this.settings);
  }

  async call(path, { method = "GET", body, query } = {}) {
    if (!this.isConfigured()) throw new Error("Bank connections are not configured.");
    const url = endpoint(this.settings.baseUrl, path);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const response = await this.request(url.href, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + this.settings.apiKey,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Bank request failed with status ${response.status}.`);
    return response.json();
  }

  async listInstitutions(country = "") {
    const query = country ? { country: String(country).slice(0, 2).toUpperCase() } : {};
    const payload = await this.call("institutions", { query });
    return (payload.institutions ?? []).slice(0, 200).map((institution) => ({
      id: String(institution.id ?? "").slice(0, 64),
      name: String(institution.name ?? "").slice(0, 120),
      country: String(institution.country ?? "").slice(0, 2).toUpperCase()
    })).filter((institution) => institution.id && institution.name);
  }

  async createConnection(institutionId) {
    const payload = await this.call("connections", {
      method: "POST",
      body: {
        institutionId: assertIdentifier(institutionId, "institution"),
        reference: this.randomId(),
        scopes: ["accounts:read", "payments:initiate"],
        redirectUri: this.settings.redirectUri
      }
    });
    return {
      id: String(payload.id ?? "").slice(0, 64),
      status: payload.status === "linked" ? "linked" : "pending",
      consentUrl: safeConsentUrl(payload.consentUrl),
      institutionId: String(payload.institutionId ?? institutionId).slice(0, 64)
    };
  }

  async listAccounts(connectionId) {
    const payload = await this.call(`connections/${assertIdentifier(connectionId, "connection")}/accounts`);
    return (payload.accounts ?? []).flatMap((account) => {
      try {
        return [sanitizeBankAccount(account)];
      } catch {
        return [];
      }
    });
  }

  async initiateTransfer(connectionId, portfolio, transfer) {
    const error = validateTransfer(portfolio, transfer);
    if (error) return { error, instruction: null, status: "rejected" };
    const instruction = buildPaymentInstruction(transfer, {
      messageId: this.randomId(),
      endToEndId: this.randomId(),
      createdAt: new Date()
    });
    const payload = await this.call(`connections/${assertIdentifier(connectionId, "connection")}/payments`, {
      method: "POST",
      body: { instruction }
    });
    return {
      error: "",
      instruction,
      status: payload.status === "settled" ? "settled" : "pending",
      paymentId: String(payload.paymentId ?? instruction.endToEndId).slice(0, 64)
    };
  }
}

export function createBankService(environment, request = fetch, randomId) {
  return new BankService(bankProviderSettings(environment), request, randomId);
}
