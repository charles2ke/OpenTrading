import { auditExport, auditFileName, filterAuditEvents, normalizeAuditEvents, summarizeAuditEvents } from "./core/audit.js";
import { initNavigation } from "./navigation.js";

const byId = (id) => document.getElementById(id);
let events = [];
let toastTimer;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function detailText(metadata) {
  const entries = Object.entries(metadata);
  return entries.length === 0 ? "—" : entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ");
}

function visibleEvents() {
  return filterAuditEvents(events, { query: byId("audit-search").value, status: byId("audit-status-filter").value });
}

function render() {
  const rows = visibleEvents();
  const summary = summarizeAuditEvents(rows);
  byId("audit-total").textContent = String(summary.total);
  byId("audit-failures").textContent = String(summary.failures);
  byId("audit-latest").textContent = summary.latest ? summary.latest.replace("T", " ").slice(0, 19) : "—";
  byId("audit-rows").innerHTML = rows.map((event) => `
    <tr>
      <td>${escapeHtml(event.occurredAt.replace("T", " ").slice(0, 19) || "Unknown")}</td>
      <td>${escapeHtml(event.action)}</td>
      <td><span class="audit-status ${event.status}">${escapeHtml(event.status)}</span></td>
      <td class="audit-actor">${escapeHtml(event.actor)}</td>
      <td>${escapeHtml(detailText(event.metadata))}</td>
    </tr>`).join("");
  byId("empty-audit").hidden = rows.length > 0;
}

function setStatus(message) {
  byId("audit-status").textContent = message;
}

async function loadEvents() {
  setStatus("Loading audit events…");
  try {
    const response = await fetch("./api/audit", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (response.status === 401) {
      events = [];
      byId("empty-audit").textContent = "Sign in on the dashboard to review your audit history.";
      setStatus("Sign in required");
      return render();
    }
    if (response.status === 503) {
      events = [];
      byId("empty-audit").textContent = "Audit history is unavailable because the database is not configured.";
      setStatus("Audit history unavailable");
      return render();
    }
    if (!response.ok) throw new Error("Unable to load audit events.");
    events = normalizeAuditEvents(await response.json());
    byId("empty-audit").textContent = "No audit events match your filters.";
    setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  } catch {
    events = [];
    byId("empty-audit").textContent = "Audit events could not be loaded. Try again.";
    setStatus("Could not load audit events");
  }
  render();
}

function download(format) {
  const rows = visibleEvents();
  if (rows.length === 0) return showToast("There are no audit events to download.");
  const { content, type } = auditExport(rows, format);
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = auditFileName(format);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${rows.length} audit event${rows.length === 1 ? "" : "s"} as ${format.toUpperCase()}`);
}

initNavigation();
byId("audit-search").addEventListener("input", render);
byId("audit-status-filter").addEventListener("change", render);
byId("audit-refresh").addEventListener("click", loadEvents);
byId("audit-download-csv").addEventListener("click", () => download("csv"));
byId("audit-download-json").addEventListener("click", () => download("json"));
loadEvents();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}
