import { SUPPORTED_TRANSFER_CURRENCIES, transferScheme, validateTransfer } from "./core/banking.js";
import { getClientId } from "./core/storage.js";

const COUNTRIES = Object.freeze([
  { code: "", name: "All countries" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "JP", name: "Japan" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" }
]);

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function bankHeaders(extra = {}) {
  return { "X-Client-ID": getClientId(localStorage, crypto.randomUUID.bind(crypto)), ...extra };
}

async function bankRequest(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options, headers: bankHeaders(options.headers) });
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error || "Banking request failed."), { status: response.status });
  return payload;
}

export function initBanking({ getPortfolio, onTransferred, showToast }) {
  const bankDialog = byId("bank-dialog");
  const bankForm = byId("bank-form");
  const transferDialog = byId("transfer-dialog");
  const transferForm = byId("transfer-form");
  const status = byId("banking-status");
  const currencySelect = byId("transfer-currency");
  const connectionSelect = byId("transfer-connection");
  let connections = [];

  byId("bank-country").innerHTML = COUNTRIES
    .map((country) => `<option value="${country.code}">${escapeHtml(country.name)}</option>`)
    .join("");
  currencySelect.innerHTML = SUPPORTED_TRANSFER_CURRENCIES
    .map((currency) => `<option value="${currency}">${currency}</option>`)
    .join("");

  function transferValues() {
    const values = Object.fromEntries(new FormData(transferForm));
    return { ...values, amount: Number(values.amount) };
  }

  function updateSchemePreview() {
    byId("transfer-scheme").textContent = transferScheme(transferValues());
  }

  function renderAccounts(accounts) {
    byId("bank-accounts").innerHTML = accounts.map((account) => `
      <article class="bank-account">
        <div><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.bank)} · ${escapeHtml(account.maskedIban)}</small></div>
        <div class="bank-account-meta"><strong>${escapeHtml(account.currency)} ${escapeHtml(account.balance.toFixed(2))}</strong><small>${escapeHtml(account.bic)} · ${escapeHtml(account.country)}</small></div>
      </article>`).join("");
    byId("empty-bank-accounts").hidden = accounts.length > 0;
  }

  async function refresh() {
    try {
      const payload = await bankRequest("./api/banking/connections");
      connections = payload.connections ?? [];
      connectionSelect.innerHTML = connections
        .map((connection) => `<option value="${escapeHtml(connection.connectionId)}">${escapeHtml(connection.institutionId)} (${escapeHtml(connection.status)})</option>`)
        .join("");
      const linked = connections.filter((connection) => connection.status === "linked");
      const accounts = (await Promise.all(linked.map(async (connection) => {
        try {
          const result = await bankRequest(`./api/banking/connections/${encodeURIComponent(connection.connectionId)}/accounts`);
          return result.accounts ?? [];
        } catch {
          return [];
        }
      }))).flat();
      renderAccounts(accounts);
      status.textContent = connections.length === 0
        ? "Connect any bank to view balances and move money securely."
        : `${connections.length} bank connection${connections.length === 1 ? "" : "s"} · consent managed by your bank`;
    } catch (error) {
      connections = [];
      renderAccounts([]);
      status.textContent = error.status === 503
        ? "Bank connections are not configured on this deployment."
        : "Bank connections are unavailable right now.";
    }
  }

  async function loadInstitutions() {
    const institutionSelect = byId("institution");
    byId("bank-error").textContent = "";
    institutionSelect.innerHTML = "";
    try {
      const query = new URLSearchParams({ country: byId("bank-country").value });
      const { institutions } = await bankRequest(`./api/banking/institutions?${query}`);
      institutionSelect.innerHTML = (institutions ?? [])
        .map((institution) => `<option value="${escapeHtml(institution.id)}">${escapeHtml(institution.name)}${institution.country ? ` (${escapeHtml(institution.country)})` : ""}</option>`)
        .join("");
      if (institutionSelect.options.length === 0) byId("bank-error").textContent = "No banks are available for that country.";
    } catch {
      byId("bank-error").textContent = "Unable to list banks right now.";
    }
  }

  byId("connect-bank").addEventListener("click", async () => {
    bankDialog.showModal();
    await loadInstitutions();
  });
  byId("bank-country").addEventListener("change", loadInstitutions);

  bankForm.addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const institutionId = byId("institution").value;
    if (!institutionId) {
      byId("bank-error").textContent = "Choose a bank to continue.";
      return;
    }
    try {
      const connection = await bankRequest("./api/banking/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId })
      });
      bankDialog.close();
      if (connection.consentUrl) window.open(connection.consentUrl, "_blank", "noopener,noreferrer");
      showToast("Finish the consent at your bank to link the account");
      await refresh();
    } catch (error) {
      byId("bank-error").textContent = error.message;
    }
  });

  byId("open-transfer").addEventListener("click", () => {
    byId("transfer-error").textContent = "";
    updateSchemePreview();
    transferDialog.showModal();
  });
  transferForm.addEventListener("input", updateSchemePreview);

  transferForm.addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const transfer = transferValues();
    const { connectionId, ...instruction } = transfer;
    if (!connectionId) {
      byId("transfer-error").textContent = "Connect a bank before transferring money.";
      return;
    }
    const error = validateTransfer(getPortfolio(), instruction);
    if (error) {
      byId("transfer-error").textContent = error;
      return;
    }
    try {
      const result = await bankRequest("./api/banking/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, transfer: instruction })
      });
      transferDialog.close();
      onTransferred(result.cash);
      showToast(`${instruction.direction === "deposit" ? "Deposit" : "Withdrawal"} sent via ${result.instruction.scheme}`);
      await refresh();
    } catch (requestError) {
      byId("transfer-error").textContent = requestError.message;
    }
  });

  refresh();
}
