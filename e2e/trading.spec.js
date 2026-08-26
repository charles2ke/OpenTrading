import { expect, test } from "@playwright/test";

test("shows a responsive global market dashboard", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-01-05T09:00:00"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good morning, Demo" })).toBeVisible();
  await expect(page.getByText("S&P 500")).toBeVisible();
  await expect(page.getByText("$100,000.00")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
});

test("places and persists a validated paper order", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Place order" }).click();
  await page.getByLabel("Stock").selectOption("AAPL");
  await page.getByLabel("Shares").fill("2");
  await expect(page.getByText("Estimated total").locator("..").getByText("$464.28")).toBeVisible();
  await page.getByRole("button", { name: "Review & place order" }).click();
  await expect(page.getByRole("status")).toHaveText("Bought 2 AAPL");
  await expect(page.getByText("Apple", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Apple", { exact: true })).toBeVisible();
});

test("rejects an unsafe oversell", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "TSLA" }).click();
  await page.getByLabel("Side").selectOption("sell");
  await page.getByRole("button", { name: "Review & place order" }).click();
  await expect(page.getByRole("alert")).toHaveText("You cannot sell more shares than you own.");
});

test("filters market movers", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search markets").fill("Tesla");
  await expect(page.getByRole("button", { name: /TSLA/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /AAPL/ })).toBeHidden();
});

test("searches every listed market, index, and identifier", async ({ page }) => {
  await page.goto("/");
  const search = page.getByLabel("Search markets");
  await expect(page.getByRole("button", { name: /HSBA/ })).toBeVisible();

  await search.fill("XETRA");
  await expect(page.getByRole("button", { name: /SAP/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /AAPL/ })).toBeHidden();
  await expect(page.getByText("No indices match your search.")).toBeVisible();

  await search.fill("US0378331005");
  await expect(page.getByRole("button", { name: /AAPL/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /SAP/ })).toBeHidden();

  await search.fill("apple nasdaq");
  await expect(page.getByRole("button", { name: /AAPL/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /MSFT/ })).toBeHidden();
  await expect(page.getByLabel("Stock")).toHaveValue("AAPL");

  await search.fill("nikkei");
  await expect(page.getByText("Nikkei 225")).toBeVisible();
  await expect(page.getByText("S&P 500")).toBeHidden();
  await expect(page.getByText("No markets match your search.")).toBeVisible();
});

test("keeps trading available when the search matches nothing", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search markets").fill("zzzz");
  await page.getByRole("button", { name: "Place order" }).click();
  await page.getByLabel("Stock").selectOption("HSBA");
  await page.getByRole("button", { name: "Review & place order" }).click();
  await expect(page.getByRole("status")).toHaveText("Bought 1 HSBA");
});

test("shows an unconfigured state for the news feed and fetches news for watched stocks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "News feed" })).toBeVisible();
  await expect(page.getByText("No news yet. Buy a stock")).toBeVisible();

  const newsRequest = page.waitForRequest((request) => request.url().includes("/api/news?symbols="));
  await page.getByRole("button", { name: "TSLA" }).click();
  await page.getByRole("button", { name: "Review & place order" }).click();
  const request = await newsRequest;
  expect(request.url()).toContain("symbols=TSLA");
  await expect(page.getByText("News feed is not configured yet.")).toBeVisible();
});

test("animates a loading placeholder while news data is fetched", async ({ page }) => {
  await page.route("**/api/news?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ status: 503, body: "" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "TSLA" }).click();
  await page.getByRole("button", { name: "Review & place order" }).click();

  await expect(page.locator("#news-feed")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByText("Loading news…")).toBeVisible();
  await expect(page.locator(".news-skeleton")).toHaveCount(3);

  await expect(page.getByText("News feed is not configured yet.")).toBeVisible();
  await expect(page.locator(".news-skeleton")).toHaveCount(0);
  await expect(page.locator("#news-feed")).not.toHaveAttribute("aria-busy", "true");
});

test("reports when authentication is not configured", async ({ page }) => {
  const session = await page.request.get("/auth/session");
  expect(session.status()).toBe(503);
  await expect(session.json()).resolves.toEqual({ error: "Authentication is unavailable." });
});

test("offers Google and Microsoft authentication", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Microsoft" })).toBeVisible();
});

test("shows the beginner's guide on its own page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Investor concepts for beginners" })).toBeHidden();
  const learn = page.getByRole("link", { name: "Learn" });
  await expect(learn).toHaveAttribute("href", "./learn.html");
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  if (await menu.isVisible()) await menu.click();
  await learn.click();
  await expect(page).toHaveURL(/learn\.html$/);
  await expect(page.getByRole("heading", { name: "Investor concepts for beginners" })).toBeVisible();
  await expect(page.getByText("A stock represents ownership in a company.")).toBeVisible();
  const shortSelling = page.locator(".guide-topic").filter({ hasText: "Short selling" });
  await expect(shortSelling.getByText("theoretically unlimited loss")).toBeHidden();
  await shortSelling.locator("summary").click();
  await expect(shortSelling.getByText("theoretically unlimited loss")).toBeVisible();
});

test("closes the mobile navigation after choosing a section", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Portfolio" }).click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("explains when a market search has no matches", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search markets").fill("zzzz");
  await expect(page.getByText("No markets match your search.")).toBeVisible();
  await page.getByLabel("Search markets").fill("Tesla");
  await expect(page.getByText("No markets match your search.")).toBeHidden();
});

test("keeps the latest confirmation visible for consecutive orders", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Place order" }).click();
  await page.getByRole("button", { name: "Review & place order" }).click();
  await expect(page.locator("#toast")).toHaveClass(/visible/);
  await page.waitForTimeout(2500);
  await expect(page.locator("#toast")).toHaveClass(/visible/);
  await page.getByRole("button", { name: "Place order" }).click();
  await page.getByRole("button", { name: "Review & place order" }).click();
  await page.waitForTimeout(1000);
  await expect(page.locator("#toast")).toHaveClass(/visible/);
});

test("highlights the section being viewed in the sidebar", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".nav-link.active")).toHaveText("⌂Overview");
  await page.locator("#news").evaluate((section) => {
    window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY - 100);
  });
  await expect(page.locator(".nav-link.active")).toHaveText("📰News");
});

test("greets the visitor for the current time of day", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-01-05T20:00:00"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good evening, Demo" })).toBeVisible();
});

test("returns to the dashboard from the beginner's guide", async ({ page }) => {
  await page.goto("/learn.html");
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Demo$/ })).toBeVisible();
});
