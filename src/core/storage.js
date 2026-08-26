import { createPortfolio, isPortfolio } from "./trading.js";

export const STORAGE_KEY = "opentrading.portfolio.v1";

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
