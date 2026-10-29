import { expect, test } from "@playwright/test";
import { LOCALES, localized, settle, watchConsole } from "../support/page-guards";

// AGENTS.md: check the browser console on home EN (`/`) and VI (`/vi`) in every viewport and color scheme.
for (const locale of LOCALES) {
  test(`home (${locale}) loads without console errors`, async ({ page }) => {
    const problems = watchConsole(page);
    const response = await page.goto(localized(locale, "/"), { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await settle(page);
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
