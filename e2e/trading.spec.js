import { expect, test } from "@playwright/test";

test("shows a responsive global market dashboard", async ({ page }, testInfo) => {
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

test("shows the beginner's guide on the website", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Learn" })).toHaveAttribute("href", "#learn");
  await expect(page.getByRole("heading", { name: "Investor concepts for beginners" })).toBeVisible();
  await expect(page.getByText("A stock represents ownership in a company.")).toBeVisible();
  const shortSelling = page.locator(".guide-topic").filter({ hasText: "Short selling" });
  await expect(shortSelling.getByText("theoretically unlimited loss")).toBeHidden();
  await shortSelling.locator("summary").click();
  await expect(shortSelling.getByText("theoretically unlimited loss")).toBeVisible();
});
