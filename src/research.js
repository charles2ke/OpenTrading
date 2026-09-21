import { initNavigation } from "./navigation.js";
import { initResearch } from "./research-ui.js";

initNavigation();
initResearch();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}
