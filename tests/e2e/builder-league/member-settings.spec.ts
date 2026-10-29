import { expect, test } from "@playwright/test";
import { LOCALES, MEMBER_STATE, localized, settle, watchConsole } from "../support/page-guards";

/**
 * Self-service data controls on `/builder-league/settings`. The delete form has two layers of confirmation
 * (the HTML `required` and `pattern` attributes, then the server check), and both must reject a wrong word.
 * Only the rejection paths run here; the one test that really deletes data uses its own throwaway member
 * in `self-delete.spec.ts`.
 */
test.use({ storageState: MEMBER_STATE });

for (const locale of LOCALES) {
  test.describe(`settings data controls (${locale})`, () => {
    test("export link downloads the member's JSON export", async ({ page }) => {
      await page.goto(localized(locale, "/builder-league/settings"), { waitUntil: "load" });
      const exportLink = page.locator('#league-data a[href="/api/v1/builder-me/export"]');
      await expect(exportLink).toBeVisible();
      await expect(exportLink).toHaveAttribute("download", "");

      // The same request the link makes, sent with the member's session cookie.
      const response = await page.request.get("/api/v1/builder-me/export");
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("application/json");
      const body = (await response.json()) as Record<string, unknown>;
      expect(JSON.stringify(body)).toContain("e2e-member-0001");
    });

    test("delete form rejects a wrong confirmation word in the browser", async ({ page }) => {
      await page.goto(localized(locale, "/builder-league/settings"), { waitUntil: "load" });
      const input = page.locator("#league-data-confirm");
      await input.fill("delete please");
      expect(await input.evaluate((el: HTMLInputElement) => el.validity.patternMismatch)).toBe(true);
      await page.locator("#league-data form").getByRole("button").click();
      // HTML validation blocks the submit, so the URL keeps no deleteError and nothing is deleted.
      await expect(page).not.toHaveURL(/deleteError=/);
      await expect(page.locator('#league-data [role="alert"]')).toHaveCount(0);
    });

    test("delete form reports a server-side confirmation error when HTML validation is skipped", async ({ page }) => {
      const problems = watchConsole(page);
      await page.goto(localized(locale, "/builder-league/settings"), { waitUntil: "load" });
      await page.locator("#league-data-confirm").fill("nope");
      await page.locator("#league-data form").evaluate((form: HTMLFormElement) => {
        form.noValidate = true;
      });
      await page.locator("#league-data form").getByRole("button").click();
      await expect(page).toHaveURL(/deleteError=confirm/);
      const alert = page.locator('#league-data [role="alert"]');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(locale === "en" ? "Type the confirmation word exactly as shown." : "Hãy gõ đúng từ xác nhận như hướng dẫn.");
      // The member is still signed in with their settings page after a rejected delete.
      await expect(page.locator("#league-data-confirm")).toBeVisible();
      await settle(page);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  });
}
