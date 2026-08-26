import { executeOrder, getInstrument, indices, instruments, summarizePortfolio } from "./core/trading.js";
import { loadPortfolio, loadRemotePortfolio, savePortfolio, saveRemotePortfolio } from "./core/storage.js";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
let portfolio = loadPortfolio(localStorage);
let installPrompt;

const byId = (id) => document.getElementById(id);
const dialog = byId("trade-dialog");
const form = byId("trade-form");
const symbolSelect = byId("symbol");

function render() {
  const summary = summarizePortfolio(portfolio);
  byId("portfolio-value").textContent = currency.format(summary.portfolioValue);
  byId("cash-value").textContent = currency.format(summary.cash);
  byId("position-count").textContent = String(summary.positions.length);
  byId("portfolio-change").textContent = `${summary.dailyChange >= 0 ? "+" : ""}${currency.format(summary.dailyChange)} today`;
  byId("portfolio-change").className = summary.dailyChange >= 0 ? "positive" : "negative";

  const rows = summary.positions.map((position) => `
    <tr>
      <td><div class="company"><span class="ticker">${position.symbol.slice(0, 2)}</span><div><strong>${position.name}</strong><small>${position.symbol}</small></div></div></td>
      <td><span class="exchange">${position.exchange}</span></td>
      <td>${number.format(position.quantity)}</td>
      <td>${currency.format(position.value)}</td>
      <td class="${position.returnValue >= 0 ? "positive" : "negative"}">${position.returnValue >= 0 ? "+" : ""}${currency.format(position.returnValue)}</td>
    </tr>`).join("");
  byId("positions").innerHTML = rows;
  byId("empty-portfolio").hidden = summary.positions.length > 0;
}

function renderMarkets() {
  byId("indices").innerHTML = indices.map((index) => `
    <article class="index-card">
      <div><span class="flag">${index.flag}</span><div><strong>${index.name}</strong><small>${index.code}</small></div></div>
      <div class="index-value"><strong>${number.format(index.value)}</strong><small class="${index.change >= 0 ? "positive" : "negative"}">${index.change >= 0 ? "↗ +" : "↘ "}${index.change}%</small></div>
    </article>`).join("");

  byId("watchlist").innerHTML = instruments.slice(0, 4).map((stock) => {
    const change = ((stock.price - stock.previousClose) / stock.previousClose) * 100;
    return `<button class="stock-row" type="button" data-symbol="${stock.symbol}">
      <span class="ticker">${stock.symbol.slice(0, 2)}</span>
      <span><strong>${stock.symbol}</strong><small>${stock.name} · ${stock.exchange}</small></span>
      <span><strong>${currency.format(stock.price)}</strong><small class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</small></span>
    </button>`;
  }).join("");

  symbolSelect.innerHTML = instruments.map((stock) =>
    `<option value="${stock.symbol}">${stock.symbol} · ${stock.name} (${stock.exchange})</option>`
  ).join("");
}

function updateOrderTotal() {
  const stock = getInstrument(symbolSelect.value);
  const quantity = Number(byId("quantity").value);
  byId("order-total").textContent = currency.format(stock ? stock.price * (Number.isFinite(quantity) ? quantity : 0) : 0);
}

function openTrade(symbol) {
  if (symbol) symbolSelect.value = symbol;
  byId("trade-error").textContent = "";
  updateOrderTotal();
  dialog.showModal();
}

document.querySelectorAll("[data-open-trade]").forEach((button) => button.addEventListener("click", () => openTrade()));
byId("watchlist").addEventListener("click", (event) => {
  const row = event.target.closest("[data-symbol]");
  if (row) openTrade(row.dataset.symbol);
});
form.addEventListener("input", updateOrderTotal);
form.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const order = { ...values, quantity: Number(values.quantity) };
  const result = executeOrder(portfolio, order);
  if (result.error) {
    byId("trade-error").textContent = result.error;
    return;
  }
  portfolio = result.portfolio;
  savePortfolio(localStorage, portfolio);
  saveRemotePortfolio(localStorage, portfolio, fetch).catch(() => {});
  render();
  dialog.close();
  const toast = byId("toast");
  toast.textContent = `${order.side === "buy" ? "Bought" : "Sold"} ${order.quantity} ${order.symbol}`;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 3000);
});

byId("search").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll(".stock-row").forEach((row) => {
    row.hidden = !row.textContent.toLowerCase().includes(query);
  });
});

document.querySelector(".menu-button").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  byId("install").hidden = false;
});
byId("install").addEventListener("click", async () => {
  await installPrompt?.prompt();
  installPrompt = undefined;
  byId("install").hidden = true;
});

renderMarkets();
render();
loadRemotePortfolio(localStorage, fetch).then((remotePortfolio) => {
  if (!remotePortfolio) return;
  portfolio = remotePortfolio;
  savePortfolio(localStorage, portfolio);
  render();
}).catch(() => {});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}
