import { expect, test } from "@playwright/test";
import { LOCALES, localized, settle, watchConsole } from "../support/page-guards";

/**
 * Public Builder League surfaces. While the flag is on, Community Wrapped and the Hall of Fame are open to
 * everyone. The Hall of Fame and Wrapped gate years with `isReviewableYear` (2026 to the current local year),
 * so 2025 answers 404 and the final Hall of Fame state cannot be reached before the 2026 year closes.
 */
for (const locale of LOCALES) {
  test.describe(`public surfaces (${locale})`, () => {
    test("Community Wrapped 2026 renders for anonymous visitors", async ({ page }) => {
      const problems = watchConsole(page);
      const response = await page.goto(localized(locale, "/wrapped/2026"), { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await settle(page);
      expect(problems, problems.join("\n")).toEqual([]);
    });

    test("Hall of Fame 2026 shows the not-final state while the year is open", async ({ page }) => {
      const problems = watchConsole(page);
      const response = await page.goto(localized(locale, "/wrapped/2026/hall-of-fame"), { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("#hof-not-final")).toBeVisible();
      // Provisional standings are never shown as official, so no ranking board is rendered.
      await expect(page.locator("#hof-not-final")).toContainText(/2026/);
      await settle(page);
      expect(problems, problems.join("\n")).toEqual([]);
    });

    test("years before 2026 are not reviewable, so Wrapped and Hall of Fame 2025 answer 404", async ({ page }) => {
      const wrapped = await page.goto(localized(locale, "/wrapped/2025"), { waitUntil: "load" });
      expect(wrapped?.status()).toBe(404);
      const hallOfFame = await page.goto(localized(locale, "/wrapped/2025/hall-of-fame"), { waitUntil: "load" });
      expect(hallOfFame?.status()).toBe(404);
    });

    test("builder profile shows the passport of an opted-in member", async ({ page }) => {
      const problems = watchConsole(page);
      const response = await page.goto(localized(locale, "/builders/e2e-member-0001"), { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      const passport = page.locator('section[aria-labelledby="builder-passport"]');
      await expect(passport).toBeVisible();
      await expect(passport.locator("dl")).toBeVisible();
      await settle(page);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  });
}

// The Hall of Fame final state needs a finished year. 2025 is not reviewable (see above), and the 2026
// year closes on 2026-12-31 plus the ruleset grace, after today's date. Enable once a closed year is reviewable
// or the suite can seed a closed year with a clock override.
test.fixme("Hall of Fame final state lists only opted-in members", () => {
  // Intentionally empty: documents the gap; covered at unit level by tests/builder-league/hall-of-fame.test.ts.
});
