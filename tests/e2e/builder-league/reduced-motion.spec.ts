import { expect, test } from "@playwright/test";
import { LOCALES, MEMBER_STATE, localized, settle, watchConsole } from "../support/page-guards";

/**
 * With `prefers-reduced-motion: reduce` the journey renders its content and starts no motion: the
 * constellation fade is a `motion-safe` class, so the figure keeps no running animation, and no animation
 * error reaches the console.
 */
test.use({ storageState: MEMBER_STATE, reducedMotion: "reduce" });

for (const locale of LOCALES) {
  test(`journey renders without animation errors under reduced motion (${locale})`, async ({ page }) => {
    const problems = watchConsole(page);
    const response = await page.goto(localized(locale, "/builder-league/journey"), { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("#journey-timeline")).toBeVisible();
    await expect(page.locator('svg[role="group"]').first()).toBeVisible();

    const figure = page.locator("figure").first();
    const animationName = await figure.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe("none");
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

    await settle(page);
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
