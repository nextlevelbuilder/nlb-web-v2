import { expect, test } from "@playwright/test";
import { THROWAWAY_STATE, localized, settle, watchConsole } from "../support/page-guards";

/**
 * The only test that deletes league data. It uses a dedicated throwaway member, never the shared member
 * fixture, and runs once (desktop light) because the deletion is not repeatable within one seed.
 * The seed recreates the throwaway member on every run.
 */
test.use({ storageState: THROWAWAY_STATE });

test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-light", "runs once: it deletes the throwaway member");
});

test("member deletes their own league data with the typed confirmation", async ({ page }) => {
  const problems = watchConsole(page);
  const response = await page.goto(localized("en", "/builder-league/settings"), { waitUntil: "load" });
  expect(response?.status()).toBe(200);

  await page.locator("#league-data-confirm").fill("DELETE");
  await page.locator("#league-data form").getByRole("button").click();

  await expect(page).toHaveURL(/[?&]deleted=1/);
  await expect(page.locator('#league-data [role="status"]')).toBeVisible();
  await settle(page);
  expect(problems, problems.join("\n")).toEqual([]);
});
