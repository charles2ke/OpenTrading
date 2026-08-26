export function initNavigation() {
  const sidebar = document.querySelector(".sidebar");
  const menuButton = document.querySelector(".menu-button");

  function setNavigationOpen(open) {
    sidebar.classList.toggle("open", open);
    menuButton.setAttribute("aria-expanded", String(open));
  }

  menuButton.addEventListener("click", () => setNavigationOpen(!sidebar.classList.contains("open")));
  sidebar.addEventListener("click", (event) => {
    if (event.target.closest(".nav-link")) setNavigationOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("open")) {
      setNavigationOpen(false);
      menuButton.focus();
    }
  });
  document.querySelector(".content").addEventListener("click", () => {
    if (sidebar.classList.contains("open")) setNavigationOpen(false);
  });
}
