import { expect, test } from "@playwright/test";

async function openTab(page, name) {
  await page.getByRole("tab", { name }).click();
}

test("opens the research workspace with a grounded company note", async ({ page }) => {
  await page.goto("/research.html");
  await expect(page.getByRole("heading", { name: "Apple (AAPL)" })).toBeVisible();
  await expect(page.locator("#overview-narrative li").first()).toContainText("Apple (AAPL) trades on NASDAQ");
  await expect(page.locator("#overview-grounding")).toContainText("as of 2026-01-05");
});

test("screens the universe from structured fundamentals", async ({ page }) => {
  await page.goto("/research.html");
  await openTab(page, "Screener");
  await page.locator("#screener-pe").fill("16");
  await page.getByRole("button", { name: "Run screen" }).click();
  await expect(page.locator("#screener-summary")).toContainText("of 10 securities match");
  await expect(page.locator("#screener-results tbody tr")).not.toHaveCount(0);
  await expect(page.locator("#screener-results")).not.toContainText("NVDA");
});

test("recalculates the DCF deterministically when an assumption changes", async ({ page }) => {
  await page.goto("/research.html");
  await openTab(page, "Valuation");
  const value = page.locator("#dcf-value");
  await expect(value).toContainText("Implied value per share");
  const before = await value.textContent();
  await page.locator("#dcf-wacc").fill("12");
  await page.getByRole("button", { name: "Recalculate" }).click();
  await expect(value).not.toHaveText(before);
  await page.locator("#dcf-wacc").fill("8.5");
  await page.getByRole("button", { name: "Recalculate" }).click();
  await expect(value).toHaveText(before);
});

test("shows earnings, technical and quant analysis with explicit uncertainty", async ({ page }) => {
  await page.goto("/research.html");
  await openTab(page, "Earnings");
  await expect(page.locator("#earnings-output")).toContainText("Next reporting date");
  await expect(page.locator("#earnings-output")).toContainText("bull");

  await openTab(page, "Technicals");
  await expect(page.locator("#technicals-output")).toContainText("RSI 14");
  await expect(page.locator("#technicals-output")).toContainText("not forecasts");
  await page.locator("#trade-entry").fill("230");
  await page.getByRole("button", { name: "Plan trade" }).click();
  await expect(page.locator("#trade-output")).toContainText("risk/reward");

  await openTab(page, "Quant");
  await expect(page.locator("#quant-output")).toContainText("Significant");
  await expect(page.locator("#quant-output")).toContainText("unavailable");
});

test("builds an allocation and measures portfolio risk", async ({ page }) => {
  await page.goto("/research.html");
  await openTab(page, "Portfolio builder");
  await page.locator("#profile-amount").fill("100000");
  await page.getByRole("button", { name: "Build allocation" }).click();
  await expect(page.locator("#builder-output")).toContainText("Target allocation");
  await expect(page.locator("#builder-output")).toContainText("not personalised tax advice");

  await openTab(page, "Risk");
  await expect(page.locator("#risk-output")).toContainText("Daily VaR 95 %");
  await page.locator("#holding-symbol").fill("MSFT");
  await page.getByRole("button", { name: "Add holding" }).click();
  await expect(page.locator("#holdings-status")).toHaveText("MSFT added to the analysed portfolio.");
  await expect(page.locator("#risk-output")).toContainText("MSFT");
});

test("saves a research report with its data snapshot", async ({ page }) => {
  await page.goto("/research.html");
  await page.getByRole("button", { name: "Save as report" }).click();
  await expect(page.locator("#reports-output")).toContainText("Apple research note");
  await expect(page.locator("#reports-output")).toContainText("2026-01-05");
});

test("resolves a security from the global search", async ({ page }) => {
  await page.goto("/research.html");
  await page.getByLabel("Search securities").fill("toyota");
  await page.getByRole("button", { name: /7203/ }).click();
  await expect(page.getByRole("heading", { name: "Toyota Motor (7203)" })).toBeVisible();
});
