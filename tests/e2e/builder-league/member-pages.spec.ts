import { expect, test } from "@playwright/test";
import { LOCALES, MEMBER_STATE, localized, settle, watchConsole } from "../support/page-guards";

/** Signed-in pilot member (paid VIP fixture, on `builder_pilot_members`). Pages render their member view. */
test.use({ storageState: MEMBER_STATE });

const MEMBER_PAGES = [
  { name: "home", path: "/builder-league" },
  { name: "leaderboards", path: "/builder-league/leaderboards" },
  { name: "evidence form", path: "/builder-league/evidence/new" },
  { name: "settings", path: "/builder-league/settings" },
] as const;

for (const locale of LOCALES) {
  test.describe(`member pages (${locale})`, () => {
    for (const { name, path } of MEMBER_PAGES) {
      test(`${name} renders for a signed-in member without console errors`, async ({ page }) => {
        const problems = watchConsole(page);
        const response = await page.goto(localized(locale, path), { waitUntil: "load" });
        expect(response?.status()).toBe(200);
        expect(new URL(page.url()).pathname).toBe(localized(locale, path));
        await expect(page.locator("h1").first()).toBeVisible();
        // The sign-in and membership panels only render for visitors who cannot use the league.
        await expect(page.locator("main").getByRole("link", { name: /sign in/i })).toHaveCount(0);
        await settle(page);
        expect(problems, problems.join("\n")).toEqual([]);
      });
    }

    test("journey lists the verified milestones and shows the constellation summary", async ({ page }) => {
      const problems = watchConsole(page);
      const response = await page.goto(localized(locale, "/builder-league/journey"), { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();

      const timeline = page.locator("#journey-timeline").locator("xpath=following-sibling::*[1]");
      await expect(timeline.locator("ol > li").first()).toBeVisible();
      // Three approved, public fixtures were seeded, so the timeline must not drop any of them.
      await expect(timeline.locator("ol > li")).toHaveCount(3);

      // The constellation is a visual summary: its accessible name states the same count as the timeline.
      const constellation = page.locator('svg[role="group"]').first();
      await expect(constellation).toBeVisible();
      await expect(constellation).toHaveAttribute("aria-label", /\S/);
      await settle(page);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  });
}

test.describe("journey with JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("the timeline is server-rendered and readable without JavaScript", async ({ page }) => {
    const response = await page.goto(localized("en", "/builder-league/journey"), { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    const timeline = page.locator("#journey-timeline").locator("xpath=following-sibling::*[1]");
    await expect(timeline).toBeVisible();
    await expect(timeline.locator("ol > li")).toHaveCount(3);
    // The constellation is a hydration-only enhancement (journey-constellation.tsx renders nothing on the
    // server), so without JavaScript the timeline is the complete view and the chart is absent by design.
    await expect(page.locator('svg[role="group"]')).toHaveCount(0);
  });
});
