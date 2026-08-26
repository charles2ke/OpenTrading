import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { applyTransfer } from "../src/core/banking.js";
import { createPortfolio, getInstrument, instruments, isPortfolio } from "../src/core/trading.js";
import { AuthService, providerSettings, sessionCookie } from "../src/server/auth.js";
import { createBankService } from "../src/server/bank-service.js";
import { createNewsService } from "../src/server/news-service.js";
import { connectDataStore } from "../src/server/portfolio-repository.js";
import { createSecuritiesCache } from "../src/server/securities-cache.js";

const root = process.env.SERVE_DIR || process.cwd();
const port = Number(process.env.PORT || 4173);
const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const mongoUri = process.env.MONGODB_URI;
const dataStorePromise = mongoUri
  ? connectDataStore(mongoUri, process.env.MONGODB_DATABASE).catch((error) => {
      console.error("MongoDB connection failed:", error.message);
      return null;
    })
  : Promise.resolve(null);
const authServicePromise = dataStorePromise.then((dataStore) => dataStore
  ? new AuthService(dataStore.auth, process.env.APP_BASE_URL || `http://127.0.0.1:${port}`, providerSettings(process.env))
  : null);
const clientIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};
const securitiesCache = createSecuritiesCache(instruments);
const newsService = createNewsService(process.env);
const bankService = createBankService(process.env);

function sendJson(response, status, value) {
  response.writeHead(status, { ...securityHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function auditActivity(auditRepository, event) {
  if (!auditRepository) return;
  try {
    await auditRepository.record(event);
  } catch (error) {
    console.error("Audit logging failed:", error?.message || error);
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new RangeError("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleAuth(request, response, pathname, requestUrl) {
  const dataStore = await dataStorePromise;
  const auditRepository = dataStore?.audit;
  const authService = await authServicePromise;
  if (!authService) return sendJson(response, 503, { error: "Authentication is unavailable." });
  if (pathname === "/auth/session" && request.method === "GET") {
    const user = await authService.current(request.headers.cookie);
    await auditActivity(auditRepository, {
      action: "auth.session.read",
      actor: user?.id || "anonymous",
      status: "success",
      metadata: { authenticated: Boolean(user) }
    });
    return sendJson(response, user ? 200 : 401, user ?? { error: "Not signed in." });
  }
  if (pathname === "/auth/logout" && request.method === "POST") {
    const user = await authService.current(request.headers.cookie);
    await authService.logout(request.headers.cookie);
    await auditActivity(auditRepository, {
      action: "auth.logout",
      actor: user?.id || "anonymous",
      status: "success",
      metadata: {}
    });
    response.writeHead(303, { ...securityHeaders, "Set-Cookie": sessionCookie("", 0), Location: "./" });
    return response.end();
  }
  const match = pathname.match(/^\/auth\/(google|microsoft)(\/callback)?$/);
  if (!match || request.method !== "GET") return sendJson(response, 404, { error: "Authentication route not found." });
  const [, provider, callback] = match;
  if (!callback) {
    const redirect = await authService.begin(provider);
    await auditActivity(auditRepository, {
      action: "auth.login.begin",
      actor: "anonymous",
      status: "success",
      metadata: { provider }
    });
    response.writeHead(302, { ...securityHeaders, Location: redirect.href, "Cache-Control": "no-store" });
    return response.end();
  }
  let result;
  try {
    result = await authService.complete(provider, requestUrl);
  } catch {
    await auditActivity(auditRepository, {
      action: "auth.login.complete",
      actor: "anonymous",
      status: "failure",
      metadata: { provider }
    });
    return sendJson(response, 400, { error: "Authentication failed." });
  }
  await auditActivity(auditRepository, {
    action: "auth.login.complete",
    actor: result.user?.id || "anonymous",
    status: "success",
    metadata: { provider }
  });
  response.writeHead(303, { ...securityHeaders, "Set-Cookie": sessionCookie(result.sessionId), Location: "../../" });
  return response.end();
}

async function resolveOwnerId(request) {
  const authService = await authServicePromise;
  const user = await authService.current(request.headers.cookie);
  const anonymousId = request.headers["x-client-id"];
  if (!user && (typeof anonymousId !== "string" || !clientIdPattern.test(anonymousId))) return null;
  return user?.id ?? `anonymous:${anonymousId}`;
}

async function handlePortfolioApi(request, response) {
  const dataStore = await dataStorePromise;
  if (!dataStore) return sendJson(response, 503, { error: "MongoDB is not configured." });
  const auditRepository = dataStore.audit;
  const ownerId = await resolveOwnerId(request);
  if (!ownerId) return sendJson(response, 400, { error: "Invalid client ID." });
  const repository = dataStore.portfolio;
  if (request.method === "GET") {
    const portfolio = await repository.find(ownerId);
    await auditActivity(auditRepository, {
      action: "portfolio.read",
      actor: ownerId,
      status: "success",
      metadata: { found: Boolean(portfolio) }
    });
    return sendJson(response, portfolio ? 200 : 404, portfolio ?? { error: "Portfolio not found." });
  }
  if (request.method === "PUT") {
    if (request.headers["content-type"] !== "application/json") return sendJson(response, 415, { error: "JSON content is required." });
    const portfolio = await readJson(request);
    if (!isPortfolio(portfolio)) return sendJson(response, 422, { error: "Invalid portfolio." });
    await repository.save(ownerId, portfolio);
    await auditActivity(auditRepository, {
      action: "portfolio.write",
      actor: ownerId,
      status: "success",
      metadata: { symbols: Object.keys(portfolio.positions).length }
    });
    return sendJson(response, 204, null);
  }
  response.setHeader("Allow", "GET, PUT");
  return sendJson(response, 405, { error: "Method not allowed." });
}

function handleSecuritiesApi(request, response, pathname) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (pathname === "/api/securities") return sendJson(response, 200, { securities: securitiesCache.list() });
  const match = pathname.match(/^\/api\/securities\/(symbol|ticker|isin|cusip|sedol)\/(.+)$/i);
  if (!match) return sendJson(response, 404, { error: "Security route not found." });
  const [, type, identifier] = match;
  const security = securitiesCache.findByIdentifier(type, identifier);
  return sendJson(response, security ? 200 : 404, security ?? { error: "Security not found." });
}

function handleNewsApi(request, response, requestUrl) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (!newsService.isConfigured()) return sendJson(response, 503, { error: "News feed is not configured." });
  const symbols = [...new Set((requestUrl.searchParams.get("symbols") || "").split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean))].slice(0, 20);
  if (symbols.length === 0) return sendJson(response, 200, { articles: [] });
  const unknown = symbols.filter((symbol) => !getInstrument(symbol));
  if (unknown.length > 0) return sendJson(response, 404, { error: `Unknown symbol(s): ${unknown.join(", ")}` });
  return newsService.forSymbols(symbols, (symbol) => getInstrument(symbol)?.name || "")
    .then((articles) => sendJson(response, 200, { articles }))
    .catch(() => sendJson(response, 502, { error: "Unable to fetch news right now." }));
}

async function handleBankingApi(request, response, pathname, requestUrl) {
  if (!bankService.isConfigured()) return sendJson(response, 503, { error: "Bank connections are not configured." });
  const dataStore = await dataStorePromise;
  if (!dataStore) return sendJson(response, 503, { error: "MongoDB is not configured." });
  const auditRepository = dataStore.audit;
  const ownerId = await resolveOwnerId(request);
  if (!ownerId) return sendJson(response, 400, { error: "Invalid client ID." });
  const connections = dataStore.bank;

  if (pathname === "/api/banking/institutions" && request.method === "GET") {
    const institutions = await bankService.listInstitutions(requestUrl.searchParams.get("country") || "");
    return sendJson(response, 200, { institutions });
  }

  if (pathname === "/api/banking/connections" && request.method === "GET") {
    return sendJson(response, 200, { connections: await connections.list(ownerId) });
  }

  if (pathname === "/api/banking/connections" && request.method === "POST") {
    if (request.headers["content-type"] !== "application/json") return sendJson(response, 415, { error: "JSON content is required." });
    const { institutionId } = await readJson(request);
    const connection = await bankService.createConnection(institutionId);
    await connections.link(ownerId, connection);
    await auditActivity(auditRepository, { action: "bank.connection.create", actor: ownerId, status: "success", metadata: { institutionId: connection.institutionId, status: connection.status } });
    return sendJson(response, 201, connection);
  }

  const accountsMatch = pathname.match(/^\/api\/banking\/connections\/([A-Za-z0-9_-]{1,64})\/accounts$/);
  if (accountsMatch && request.method === "GET") {
    const connectionId = accountsMatch[1];
    if (!await connections.owns(ownerId, connectionId)) return sendJson(response, 404, { error: "Bank connection not found." });
    const accounts = await bankService.listAccounts(connectionId);
    await auditActivity(auditRepository, { action: "bank.accounts.read", actor: ownerId, status: "success", metadata: { accounts: accounts.length } });
    return sendJson(response, 200, { accounts });
  }

  const unlinkMatch = pathname.match(/^\/api\/banking\/connections\/([A-Za-z0-9_-]{1,64})$/);
  if (unlinkMatch && request.method === "DELETE") {
    const removed = await connections.unlink(ownerId, unlinkMatch[1]);
    await auditActivity(auditRepository, { action: "bank.connection.delete", actor: ownerId, status: removed ? "success" : "failure", metadata: {} });
    return sendJson(response, removed ? 204 : 404, removed ? null : { error: "Bank connection not found." });
  }

  if (pathname === "/api/banking/transfers" && request.method === "POST") {
    if (request.headers["content-type"] !== "application/json") return sendJson(response, 415, { error: "JSON content is required." });
    const { connectionId, transfer } = await readJson(request);
    if (!await connections.owns(ownerId, connectionId)) return sendJson(response, 404, { error: "Bank connection not found." });
    const portfolio = await dataStore.portfolio.find(ownerId) ?? createPortfolio();
    const result = await bankService.initiateTransfer(connectionId, portfolio, transfer);
    if (result.error) {
      await auditActivity(auditRepository, { action: "bank.transfer", actor: ownerId, status: "failure", metadata: { reason: result.error } });
      return sendJson(response, 422, { error: result.error });
    }
    const settled = applyTransfer(portfolio, transfer);
    await dataStore.portfolio.save(ownerId, settled.portfolio);
    await auditActivity(auditRepository, {
      action: "bank.transfer",
      actor: ownerId,
      status: "success",
      metadata: { direction: transfer.direction, scheme: result.instruction.scheme, currency: result.instruction.amount.currency }
    });
    return sendJson(response, 202, { status: result.status, paymentId: result.paymentId, instruction: result.instruction, cash: settled.portfolio.cash });
  }

  response.setHeader("Allow", "GET, POST, DELETE");
  return sendJson(response, 405, { error: "Method not allowed." });
}

createServer(async (request, response) => {
  let parsedUrl;
  let pathname;
  try {
    parsedUrl = new URL(request.url, process.env.APP_BASE_URL || `http://127.0.0.1:${port}`);
    pathname = decodeURIComponent(parsedUrl.pathname);
    if (pathname.startsWith("/auth/")) {
      try {
        return await handleAuth(request, response, pathname, parsedUrl);
      } catch {
        const dataStore = await dataStorePromise;
        await auditActivity(dataStore?.audit, { action: "auth.request", actor: "anonymous", status: "failure", metadata: { pathname, method: request.method } });
        return sendJson(response, 400, { error: "Authentication failed." });
      }
    }
  } catch {
    return sendJson(response, 400, { error: "Invalid URL." });
  }
  if (pathname === "/api/portfolio") {
    try {
      return await handlePortfolioApi(request, response);
    } catch {
      const dataStore = await dataStorePromise;
      await auditActivity(dataStore?.audit, { action: "portfolio.request", actor: "anonymous", status: "failure", metadata: { method: request.method } });
      return sendJson(response, 400, { error: "Invalid request." });
    }
  }
  if (pathname.startsWith("/api/banking")) {
    try {
      return await handleBankingApi(request, response, pathname, parsedUrl);
    } catch {
      const dataStore = await dataStorePromise;
      await auditActivity(dataStore?.audit, { action: "bank.request", actor: "anonymous", status: "failure", metadata: { pathname, method: request.method } });
      return sendJson(response, 400, { error: "Invalid banking request." });
    }
  }
  if (pathname === "/api/securities" || pathname.startsWith("/api/securities/")) return handleSecuritiesApi(request, response, pathname);
  if (pathname === "/api/news") return handleNewsApi(request, response, parsedUrl);
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
  let file = join(root, relative || "index.html");
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      ...securityHeaders
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`OpenTrading running at http://127.0.0.1:${port}`));
