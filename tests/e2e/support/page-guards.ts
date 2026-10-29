import { expect, type Page } from "@playwright/test";
import path from "node:path";

export type Locale = "en" | "vi";
export const LOCALES: readonly Locale[] = ["en", "vi"];

/** Storage state files written by the global setup (signed-in fixtures). */
export const MEMBER_STATE = path.resolve(import.meta.dirname, "../.auth/member.json");
export const THROWAWAY_STATE = path.resolve(import.meta.dirname, "../.auth/throwaway.json");

/** EN is served unprefixed and VI under `/vi` (see i18n/routing.ts). */
export function localized(locale: Locale, pathname: string): string {
  if (locale === "en") return pathname;
  return pathname === "/" ? "/vi" : `/vi${pathname}`;
}

/** Collects console errors and uncaught page errors for the whole life of the page. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  return problems;
}

/** Gives hydration and deferred requests a moment to report errors; never fails on a busy network. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

/** AGENTS.md reflow rule: no horizontal scroll at the current viewport width. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `document is ${scrollWidth}px wide in a ${clientWidth}px viewport`).toBeLessThanOrEqual(clientWidth);
}
