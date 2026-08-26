import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { isPortfolio } from "../src/core/trading.js";
import { AuthService, providerSettings, sessionCookie } from "../src/server/auth.js";
import { connectDataStore } from "../src/server/portfolio-repository.js";

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

function sendJson(response, status, value) {
  response.writeHead(status, { ...securityHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
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
  const authService = await authServicePromise;
  if (!authService) return sendJson(response, 503, { error: "Authentication is unavailable." });
  if (pathname === "/auth/session" && request.method === "GET") {
    const user = await authService.current(request.headers.cookie);
    return sendJson(response, user ? 200 : 401, user ?? { error: "Not signed in." });
  }
  if (pathname === "/auth/logout" && request.method === "POST") {
    await authService.logout(request.headers.cookie);
    response.writeHead(303, { ...securityHeaders, "Set-Cookie": sessionCookie("", 0), Location: "./" });
    return response.end();
  }
  const match = pathname.match(/^\/auth\/(google|microsoft)(\/callback)?$/);
  if (!match || request.method !== "GET") return sendJson(response, 404, { error: "Authentication route not found." });
  const [, provider, callback] = match;
  if (!callback) {
    const redirect = await authService.begin(provider);
    response.writeHead(302, { ...securityHeaders, Location: redirect.href, "Cache-Control": "no-store" });
    return response.end();
  }
  const result = await authService.complete(provider, requestUrl);
  response.writeHead(303, { ...securityHeaders, "Set-Cookie": sessionCookie(result.sessionId), Location: "../../" });
  return response.end();
}

async function handlePortfolioApi(request, response) {
  const dataStore = await dataStorePromise;
  if (!dataStore) return sendJson(response, 503, { error: "MongoDB is not configured." });
  const authService = await authServicePromise;
  const user = await authService.current(request.headers.cookie);
  const anonymousId = request.headers["x-client-id"];
  if (!user && (typeof anonymousId !== "string" || !clientIdPattern.test(anonymousId))) return sendJson(response, 400, { error: "Invalid client ID." });
  const ownerId = user?.id ?? `anonymous:${anonymousId}`;
  const repository = dataStore.portfolio;
  if (request.method === "GET") {
    const portfolio = await repository.find(ownerId);
    return sendJson(response, portfolio ? 200 : 404, portfolio ?? { error: "Portfolio not found." });
  }
  if (request.method === "PUT") {
    if (request.headers["content-type"] !== "application/json") return sendJson(response, 415, { error: "JSON content is required." });
    const portfolio = await readJson(request);
    if (!isPortfolio(portfolio)) return sendJson(response, 422, { error: "Invalid portfolio." });
    await repository.save(ownerId, portfolio);
    return sendJson(response, 204, null);
  }
  response.setHeader("Allow", "GET, PUT");
  return sendJson(response, 405, { error: "Method not allowed." });
}

createServer(async (request, response) => {
  let pathname;
  try {
    const parsedUrl = new URL(request.url, process.env.APP_BASE_URL || `http://127.0.0.1:${port}`);
    pathname = decodeURIComponent(parsedUrl.pathname);
    if (pathname.startsWith("/auth/")) {
      try {
        return await handleAuth(request, response, pathname, parsedUrl);
      } catch {
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
      return sendJson(response, 400, { error: "Invalid request." });
    }
  }
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
