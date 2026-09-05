const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatMoney(value, currency) {
  const amount = Number(value) || 0;
  return currency ? `${currency} ${amount.toFixed(2)}` : amount.toFixed(2);
}

export async function initBrokerage() {
  const status = byId("brokerage-status");
  const list = byId("brokerage-positions");
  try {
    const response = await fetch("./api/broker/summary", { credentials: "same-origin" });
    if (response.status === 503) {
      status.textContent = "Trading 212 is not configured on this deployment.";
      list.innerHTML = "";
      return;
    }
    if (!response.ok) throw new Error("Unable to load the Trading 212 account.");
    const summary = await response.json();
    status.textContent = `Trading 212 · cash ${formatMoney(summary.cash, summary.currency)} · account value ${formatMoney(summary.accountValue, summary.currency)}`;
    list.innerHTML = (summary.positions ?? []).map((position) => `
      <article class="bank-account">
        <div><strong>${escapeHtml(position.symbol)}</strong><small>${escapeHtml(position.quantity)} @ ${escapeHtml(formatMoney(position.averagePrice, summary.currency))}</small></div>
        <div class="bank-account-meta"><strong>${escapeHtml(formatMoney(position.value, summary.currency))}</strong><small>${escapeHtml(formatMoney(position.returnValue, summary.currency))}</small></div>
      </article>`).join("");
  } catch {
    status.textContent = "Trading 212 is unavailable right now.";
    list.innerHTML = "";
  }
}
