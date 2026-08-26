import { executeOrder, getInstrument, indices, instruments, summarizePortfolio } from "./core/trading.js";
import { watchedSymbols } from "./core/news.js";
import { initNavigation } from "./navigation.js";
import { loadPortfolio, loadRemotePortfolio, savePortfolio, saveRemotePortfolio } from "./core/storage.js";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const relativeTime = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
let portfolio = loadPortfolio(localStorage);
let installPrompt;
let newsRequestId = 0;
let toastTimer;

const byId = (id) => document.getElementById(id);
const dialog = byId("trade-dialog");
const form = byId("trade-form");
const symbolSelect = byId("symbol");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatRelativeTime(isoDate) {
  const minutes = Math.round((Date.parse(isoDate) - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour");
  return relativeTime.format(Math.round(hours / 24), "day");
}

const KNOWN_NEWS_SOURCES = new Set(["news", "twitter"]);

function newsSourceClass(source) {
  return KNOWN_NEWS_SOURCES.has(source) ? source : "other";
}

function safeArticleUrl(url) {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol) ? url : "";
  } catch {
    return "";
  }
}

function renderNews(articles, emptyMessage) {
  byId("news-feed").removeAttribute("aria-busy");
  byId("news-feed").innerHTML = articles.map((article) => `
    <article class="news-item">
      <span class="news-source ${newsSourceClass(article.source)}">${escapeHtml(article.source)}</span>
      <a href="${escapeHtml(safeArticleUrl(article.url))}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(article.title)}</strong></a>
      <small>${escapeHtml(article.symbol)} · ${escapeHtml(formatRelativeTime(article.publishedAt))}${article.author ? ` · ${escapeHtml(article.author)}` : ""}</small>
    </article>`).join("");
  const empty = byId("empty-news");
  empty.hidden = articles.length > 0;
  if (emptyMessage) empty.textContent = emptyMessage;
}

function showNewsLoading() {
  byId("news-status").textContent = "Loading news…";
  byId("news-feed").setAttribute("aria-busy", "true");
  byId("empty-news").hidden = true;
  byId("news-feed").innerHTML = Array.from({ length: 3 }, () => `
    <article class="news-item news-skeleton" aria-hidden="true">
      <span class="skeleton-line short"></span>
      <span class="skeleton-line"></span>
      <span class="skeleton-line medium"></span>
    </article>`).join("");
}

async function loadNews() {
  const symbols = watchedSymbols(portfolio);
  const requestId = ++newsRequestId;
  if (symbols.length === 0) {
    byId("news-status").textContent = "Updated just now";
    renderNews([], "No news yet. Buy a stock to follow its headlines and posts.");
    return;
  }
  try {
    showNewsLoading();
    const query = new URLSearchParams({ symbols: symbols.join(",") });
    const response = await fetch(`./api/news?${query}`, { credentials: "same-origin" });
    if (requestId !== newsRequestId) return;
    if (!response.ok) {
      byId("news-status").textContent = "News feed unavailable";
      renderNews([], "News feed is not configured yet. Add API keys to see headlines and posts.");
      return;
    }
    const { articles } = await response.json();
    byId("news-status").textContent = "Updated just now";
    renderNews(Array.isArray(articles) ? articles : [], "No recent news for your watched stocks.");
  } catch {
    if (requestId !== newsRequestId) return;
    byId("news-status").textContent = "News feed unavailable";
    renderNews([], "News feed is not configured yet. Add API keys to see headlines and posts.");
  }
}

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
  loadNews();
  dialog.close();
  const toast = byId("toast");
  toast.textContent = `${order.side === "buy" ? "Bought" : "Sold"} ${order.quantity} ${order.symbol}`;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3000);
});

byId("search").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  const rows = [...document.querySelectorAll(".stock-row")];
  rows.forEach((row) => {
    row.hidden = !row.textContent.toLowerCase().includes(query);
  });
  byId("empty-watchlist").hidden = rows.some((row) => !row.hidden);
});

initNavigation();

const sections = [...document.querySelectorAll(".nav-link")]
  .filter((link) => link.getAttribute("href").startsWith("#"))
  .map((link) => ({ link, section: document.querySelector(link.getAttribute("href")) }))
  .filter(({ section }) => section);

function updateActiveSection() {
  if (sections.length === 0) return;
  const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
  const current = atBottom
    ? sections.at(-1)
    : [...sections].reverse().find(({ section }) => section.getBoundingClientRect().top <= 120) ?? sections[0];
  sections.forEach(({ link }) => link.classList.toggle("active", link === current.link));
}

window.addEventListener("scroll", updateActiveSection, { passive: true });
window.addEventListener("resize", updateActiveSection);
updateActiveSection();

byId("greeting").textContent = `${greetingFor(new Date())}, Demo`;

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
loadNews();
loadRemotePortfolio(localStorage, fetch).then((remotePortfolio) => {
  if (!remotePortfolio) return;
  portfolio = remotePortfolio;
  savePortfolio(localStorage, portfolio);
  render();
  loadNews();
}).catch(() => {});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}
