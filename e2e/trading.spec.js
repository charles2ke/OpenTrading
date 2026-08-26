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
