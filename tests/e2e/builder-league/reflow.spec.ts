import { expect, test } from "@playwright/test";
import { LOCALES, MEMBER_STATE, localized, expectNoHorizontalOverflow, watchConsole } from "../support/page-guards";

/**
 * AGENTS.md reflow rule: no horizontal scroll at 320 px. The check runs on the narrow projects only
 * (320 px reflow and 375 px mobile); wider projects skip it because their pages are not reflowed.
 */
test.use({ storageState: MEMBER_STATE });

const PAGES = [
  { name: "public Wrapped 2026", path: "/wrapped/2026" },
  { name: "public Hall of Fame 2026", path: "/wrapped/2026/hall-of-fame" },
  { name: "public builder passport", path: "/builders/e2e-member-0001" },
  { name: "member home", path: "/builder-league" },
  { name: "leaderboards", path: "/builder-league/leaderboards" },
  { name: "journey", path: "/builder-league/journey" },
  { name: "evidence form", path: "/builder-league/evidence/new" },
  { name: "settings", path: "/builder-league/settings" },
] as const;

test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.use.viewport!.width > 375, "reflow is checked at 320 and 375 px only");
});

for (const locale of LOCALES) {
  for (const { name, path } of PAGES) {
    test(`${name} reflows without horizontal scroll (${locale})`, async ({ page }) => {
      const problems = watchConsole(page);
      const response = await page.goto(localized(locale, path), { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}
