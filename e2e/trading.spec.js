import { expect, test } from "@playwright/test";
import { stubBanking, stubBrokerage } from "./banking-fixtures.js";

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
  await expect(page.locator("#toast")).toHaveText("Bought 2 AAPL");
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

test("matches punctuation and comma separated searches", async ({ page }) => {
  await page.goto("/");
  const search = page.getByLabel("Search markets");

  await search.fill("aapl.");
  await expect(page.getByRole("button", { name: /AAPL/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /MSFT/ })).toBeHidden();

  await search.fill("tsla, msft");
  await expect(page.getByRole("button", { name: /TSLA/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /MSFT/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /AAPL/ })).toBeHidden();
});

test("keeps trading available when the search matches nothing", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search markets").fill("zzzz");
  await page.getByRole("button", { name: "Place order" }).click();
  await page.getByLabel("Stock").selectOption("HSBA");
  await page.getByRole("button", { name: "Review & place order" }).click();
  await expect(page.locator("#toast")).toHaveText("Bought 1 HSBA");
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

test("explains how to install and set up OpenTrading on its own page", async ({ page }) => {
  await page.goto("/");
  const setup = page.getByRole("link", { name: "Setup" });
  await expect(setup).toHaveAttribute("href", "./setup.html");
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  if (await menu.isVisible()) await menu.click();
  await setup.click();
  await expect(page).toHaveURL(/setup\.html$/);
  await expect(page.getByRole("heading", { name: "Set up OpenTrading" })).toBeVisible();
  const windows = page.locator(".guide-topic").filter({ hasText: "Windows" });
  await expect(windows.getByText("Snapdragon")).toBeHidden();
  await windows.locator("summary").click();
  await expect(windows.getByText("Snapdragon")).toBeVisible();
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Demo$/ })).toBeVisible();
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

test("opens the order dialog from the Trade navigation link", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#trade-dialog")).toBeHidden();
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Trade" }).click();
  await expect(page.getByRole("heading", { name: "Place an order" })).toBeVisible();
});

test("opens the order dialog when arriving from another page's Trade link", async ({ page }) => {
  await page.goto("/learn.html");
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Trade" }).click();
  await expect(page).toHaveURL(/index\.html#trade$/);
  await expect(page.getByRole("heading", { name: "Place an order" })).toBeVisible();
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

test("explains when bank connections are not configured", async ({ page }) => {
  await page.goto("/banking.html");
  await expect(page.getByRole("heading", { name: "Banking" })).toBeVisible();
  await expect(page.getByText("Bank connections are not configured on this deployment.")).toBeVisible();
  await expect(page.getByText("No bank connected yet.")).toBeVisible();
});

test("connects a bank and lists masked account details", async ({ page }) => {
  await stubBanking(page);
  await page.goto("/banking.html");
  await expect(page.getByText("1 bank connection · consent managed by your bank")).toBeVisible();
  await expect(page.getByText("DE••••3000")).toBeVisible();
  await expect(page.getByText("EUR 2500.00")).toBeVisible();

  await page.getByRole("button", { name: "Connect a bank" }).click();
  await expect(page.locator("#institution option")).toHaveCount(7);
  await page.locator("#bank-country").selectOption("DE");
  await expect(page.locator("#institution")).toHaveValue("commerzbank");
  await page.locator("#bank-country").selectOption("IE");
  await expect(page.locator("#institution")).toHaveValue("aib");
  await page.locator("#bank-country").selectOption("NL");
  await expect(page.locator("#institution")).toHaveValue("abn-amro");
  await page.locator("#bank-country").selectOption("IN");
  await expect(page.locator("#institution")).toHaveValue("icici-bank");
  await page.locator("#bank-country").selectOption("DE");
  await page.getByRole("button", { name: "Continue to bank consent" }).click();
  await expect(page.locator("#toast")).toHaveText("Finish the consent at your bank to link the account");
});

test("rejects an invalid IBAN and sends a valid ISO 20022 transfer", async ({ page }) => {
  await stubBanking(page);
  await page.goto("/banking.html");
  await page.getByRole("button", { name: "Transfer money" }).click();
  await page.locator("#account-name").fill("Ada Lovelace");
  await page.locator("#iban").fill("DE00 0000");
  await page.locator("#bic").fill("COBADEFFXXX");
  await page.getByRole("button", { name: "Review & send transfer" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a valid IBAN.");

  await page.locator("#iban").fill("DE89 3704 0044 0532 0130 00");
  await page.locator("#transfer-currency").selectOption("EUR");
  await page.locator("#amount").fill("250.50");
  await expect(page.getByText("Settlement scheme").locator("..").getByText("SEPA")).toBeVisible();
  await page.getByRole("button", { name: "Review & send transfer" }).click();
  await expect(page.locator("#toast")).toHaveText("Deposit sent via SEPA");
  await expect(page.locator("#cash-value")).toHaveText("$100,250.50");
});

test("sends an Indian domestic transfer over IMPS", async ({ page }) => {
  await stubBanking(page);
  await page.goto("/banking.html");
  await expect(page.getByText("50••••6789")).toBeVisible();

  await page.getByRole("button", { name: "Transfer money" }).click();
  await page.locator("#transfer-currency").selectOption("INR");
  await expect(page.locator("#international-fields")).toBeHidden();
  await page.locator("#account-name").fill("Asha Rao");
  await page.locator("#ifsc").fill("HDFC1001234");
  await page.locator("#account-number").fill("50100123456789");
  await page.locator("#amount").fill("5000");
  await page.getByRole("button", { name: "Review & send transfer" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a valid IFSC code.");

  await page.locator("#ifsc").fill("HDFC0001234");
  await expect(page.getByText("Settlement scheme").locator("..").getByText("IMPS")).toBeVisible();
  await page.getByRole("button", { name: "Review & send transfer" }).click();
  await expect(page.locator("#toast")).toHaveText("Deposit sent via IMPS");
});

test("shows the connected Trading 212 account", async ({ page }) => {
  await stubBanking(page);
  await stubBrokerage(page);
  await page.goto("/banking.html");
  await expect(page.getByText("Trading 212 · cash GBP 1500.25 · account value GBP 1720.25")).toBeVisible();
  await expect(page.getByText("AAPL_US_EQ")).toBeVisible();
});

test("explains when Trading 212 is not configured", async ({ page }) => {
  await page.goto("/banking.html");
  await expect(page.getByText("Trading 212 is not configured on this deployment.")).toBeVisible();
});

test.describe("audit log", () => {
  test.use({ serviceWorkers: "block" });

  test("shows the audit log page and downloads the events", async ({ page }) => {
    await page.route("**/api/audit*", async (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: [
          { occurredAt: "2026-01-05T09:00:00.000Z", action: "auth.login.complete", actor: "actor:demo", status: "success", metadata: { provider: "google" } },
          { occurredAt: "2026-01-06T10:30:00.000Z", action: "portfolio.write", actor: "actor:demo", status: "failure", metadata: { symbols: 2 } }
        ]
      })
    }));
    await page.goto("/");
    const audit = page.getByRole("link", { name: "Audit" });
    const menu = page.getByRole("button", { name: "Toggle navigation" });
    if (await menu.isVisible()) await menu.click();
    await audit.click();
    await expect(page).toHaveURL(/audit\.html$/);
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(3);
    await expect(page.locator("#audit-total")).toHaveText("2");
    await expect(page.locator("#audit-failures")).toHaveText("1");

    await page.locator("#audit-status-filter").selectOption("failure");
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.locator("#audit-rows .audit-status.failure")).toHaveText("failure");

    await page.locator("#audit-status-filter").selectOption("all");
    await page.locator("#audit-search").fill("google");
    await expect(page.getByRole("row")).toHaveCount(2);

    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download CSV" }).click()
    ]).then(([event]) => event);
    expect(download.suggestedFilename()).toMatch(/^opentrading-audit-.+\.csv$/);
    await expect(page.locator("#toast")).toHaveText("Downloaded 1 audit event as CSV");

    const jsonDownload = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download JSON" }).click()
    ]).then(([event]) => event);
    expect(jsonDownload.suggestedFilename()).toMatch(/^opentrading-audit-.+\.json$/);
  });

  test("explains when audit history is unavailable", async ({ page }) => {
    await page.goto("/audit.html");
    await expect(page.getByText("Audit history is unavailable because the database is not configured.")).toBeVisible();
    await expect(page.locator("#audit-status")).toHaveText("Audit history unavailable");
    await page.getByRole("button", { name: "Download CSV" }).click();
    await expect(page.locator("#toast")).toHaveText("There are no audit events to download.");
  });
});
