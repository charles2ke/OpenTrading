import { test } from "@playwright/test";

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
  });
});
