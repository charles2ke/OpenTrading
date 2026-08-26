import { createPortfolio, isPortfolio } from "./trading.js";

export const STORAGE_KEY = "opentrading.portfolio.v1";
export const CLIENT_KEY = "opentrading.client.v1";

export function loadPortfolio(storage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    return isPortfolio(value) ? value : createPortfolio();
  } catch {
    return createPortfolio();
  }
}

export function savePortfolio(storage, portfolio) {
  if (!isPortfolio(portfolio)) throw new TypeError("Refusing to store an invalid portfolio.");
  storage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
}

export function getClientId(storage, randomUUID) {
  const stored = storage.getItem(CLIENT_KEY);
  if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
  const clientId = randomUUID();
  storage.setItem(CLIENT_KEY, clientId);
  return clientId;
}

export async function loadRemotePortfolio(storage, request, randomUUID = crypto.randomUUID.bind(crypto)) {
  const response = await request("./api/portfolio", {
    headers: { "X-Client-ID": getClientId(storage, randomUUID) },
    credentials: "same-origin"
  });
  if (response.status === 404 || response.status === 503) return null;
  if (!response.ok) throw new Error("Unable to load the remote portfolio.");
  const portfolio = await response.json();
  if (!isPortfolio(portfolio)) throw new Error("The server returned an invalid portfolio.");
  return portfolio;
}

export async function saveRemotePortfolio(storage, portfolio, request, randomUUID = crypto.randomUUID.bind(crypto)) {
  if (!isPortfolio(portfolio)) throw new TypeError("Refusing to send an invalid portfolio.");
  const response = await request("./api/portfolio", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Client-ID": getClientId(storage, randomUUID)
    },
    credentials: "same-origin",
    body: JSON.stringify(portfolio)
  });
  if (response.status === 503) return false;
  if (!response.ok) throw new Error("Unable to save the remote portfolio.");
  return true;
}
