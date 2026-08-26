import { initBanking } from "./banking-ui.js";
import { initNavigation } from "./navigation.js";
import { loadPortfolio, loadRemotePortfolio, savePortfolio } from "./core/storage.js";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const byId = (id) => document.getElementById(id);
let portfolio = loadPortfolio(localStorage);
let toastTimer;

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3000);
}

function renderCash() {
  byId("cash-value").textContent = currency.format(portfolio.cash);
}

initNavigation();
initBanking({
  getPortfolio: () => portfolio,
  showToast,
  onTransferred: (cash) => {
    if (!Number.isFinite(cash)) return;
    portfolio = { ...portfolio, cash };
    savePortfolio(localStorage, portfolio);
    renderCash();
  }
});

renderCash();
loadRemotePortfolio(localStorage, fetch).then((remotePortfolio) => {
  if (!remotePortfolio) return;
  portfolio = remotePortfolio;
  savePortfolio(localStorage, portfolio);
  renderCash();
}).catch(() => {});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}
