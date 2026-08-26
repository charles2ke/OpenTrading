import { test } from "@playwright/test";
import { stubBanking } from "./banking-fixtures.js";

const directory = new URL("./screenshots/", import.meta.url).pathname;
const shot = (name) => `${directory}${name}.png`;

test.describe("documentation screenshots", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Documentation images are captured once, on Chromium.");

  test("captures the pages and actions used in the README", async ({ page }) => {
    const mobile = (page.viewportSize()?.width ?? 0) < 768;
    const suffix = mobile ? "mobile" : "desktop";
    await page.clock.setFixedTime(new Date("2026-01-05T09:00:00"));
    await page.goto("/");

    await page.screenshot({ path: shot(`dashboard-${suffix}`), fullPage: true });

    if (mobile) {
      await page.getByRole("button", { name: "Toggle navigation" }).click();
      await page.screenshot({ path: shot("navigation-mobile") });
      await page.keyboard.press("Escape");
    }

    await page.getByRole("button", { name: "Place order" }).click();
    await page.getByLabel("Stock").selectOption("AAPL");
    await page.getByLabel("Shares").fill("12");
    await page.screenshot({ path: shot(`place-order-${suffix}`) });

    await page.getByRole("button", { name: "Review & place order" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot(`order-confirmation-${suffix}`), fullPage: true });

    await page.getByRole("button", { name: "TSLA" }).click();
    await page.getByLabel("Side").selectOption("sell");
    await page.getByRole("button", { name: "Review & place order" }).click();
    await page.screenshot({ path: shot(`order-validation-${suffix}`) });
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByLabel("Search markets").fill("Tesla");
    await page.screenshot({ path: shot(`market-search-${suffix}`), fullPage: true });

    await page.getByLabel("Search markets").fill("");
    await page.route("**/api/news?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.fulfill({ status: 503, body: "" });
    });
    await page.getByRole("button", { name: "Place order" }).click();
    await page.getByLabel("Side").selectOption("buy");
    await page.getByLabel("Stock").selectOption("AAPL");
    await page.getByLabel("Shares").fill("1");
    await page.getByRole("button", { name: "Review & place order" }).click();
    await page.locator(".news-skeleton").first().waitFor();
    await page.locator("#news").scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot(`news-loading-${suffix}`) });

    await page.goto("/learn.html");
    await page.screenshot({ path: shot(`beginners-guide-${suffix}`), fullPage: true });

    await page.evaluate(() => navigator.serviceWorker?.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))));
    await page.route("**/api/audit*", async (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: [
          { occurredAt: "2026-01-05T08:58:11.000Z", action: "auth.login.complete", actor: "actor:4f2c9d", status: "success", metadata: { provider: "google" } },
          { occurredAt: "2026-01-05T08:59:02.000Z", action: "portfolio.read", actor: "actor:4f2c9d", status: "success", metadata: { found: true } },
          { occurredAt: "2026-01-05T09:00:41.000Z", action: "portfolio.write", actor: "actor:4f2c9d", status: "success", metadata: { symbols: 3 } },
          { occurredAt: "2026-01-05T09:02:15.000Z", action: "auth.login.complete", actor: "actor:4f2c9d", status: "failure", metadata: { provider: "microsoft" } }
        ]
      })
    }));
    await page.goto("/audit.html");
    await page.locator("#audit-rows tr").first().waitFor();
    await page.screenshot({ path: shot(`audit-log-${suffix}`), fullPage: true });
  });

  test("captures the banking panel and the transfer dialog", async ({ page }) => {
    const suffix = (page.viewportSize()?.width ?? 0) < 768 ? "mobile" : "desktop";
    await stubBanking(page);
    await page.goto("/");
    await page.locator(".bank-account").first().waitFor();
    await page.locator("#banking").scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot(`banking-${suffix}`), fullPage: true });

    await page.getByRole("button", { name: "Transfer money" }).click();
    await page.locator("#account-name").fill("Ada Lovelace");
    await page.locator("#iban").fill("DE89 3704 0044 0532 0130 00");
    await page.locator("#bic").fill("COBADEFFXXX");
    await page.locator("#transfer-currency").selectOption("EUR");
    await page.locator("#amount").fill("250.50");
    await page.screenshot({ path: shot(`transfer-${suffix}`) });
  });
});
