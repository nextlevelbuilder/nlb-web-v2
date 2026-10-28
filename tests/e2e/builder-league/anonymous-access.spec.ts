import { expect, test } from "@playwright/test";
import { LOCALES, localized, watchConsole } from "../support/page-guards";

/**
 * Anonymous visitors with the flag on (this suite's server). Member pages send them to sign in, and the
 * API answers 401 JSON. The flag-off 404 branch (`requirePrivatePageViewer`, `builderNotFound`) needs a server
 * with `BUILDER_LEAGUE_ENABLED` unset; it is covered by the vitest suite, not here.
 */
for (const locale of LOCALES) {
  test.describe(`anonymous member pages (${locale})`, () => {
    test("builder home shows the sign-in panel with a callback to the page", async ({ page }) => {
      const problems = watchConsole(page);
      const response = await page.goto(localized(locale, "/builder-league"), { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      const signIn = page.locator('main a[href*="/sign-in"]').first();
      await expect(signIn).toBeVisible();
      expect(await signIn.getAttribute("href")).toContain("callbackUrl");
      expect(problems, problems.join("\n")).toEqual([]);
    });

    test("settings shows the sign-in panel, not the data controls", async ({ page }) => {
      const response = await page.goto(localized(locale, "/builder-league/settings"), { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("#league-data")).toHaveCount(0);
      await expect(page.locator('main a[href*="/sign-in"]').first()).toBeVisible();
    });

    test("journey redirects to sign-in with a callback to the journey", async ({ page }) => {
      await page.goto(localized(locale, "/builder-league/journey"), { waitUntil: "load" });
      await expect(page).toHaveURL(/\/sign-in/);
      const callback = new URL(page.url()).searchParams.get("callbackUrl");
      expect(callback).toContain("/builder-league/journey");
    });
  });
}

test("member APIs answer 401 JSON to anonymous callers", async ({ request }) => {
  const exportResponse = await request.get("/api/v1/builder-me/export", { timeout: 300_000 });
  expect(exportResponse.status()).toBe(401);
  expect(exportResponse.headers()["content-type"]).toContain("application/json");
});
