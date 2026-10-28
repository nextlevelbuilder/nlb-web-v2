import type { FullConfig } from "@playwright/test";
import { migrateLocalD1, seedLocalData } from "./seed-local-data";

/**
 * Runs once before the projects, after the webServer is up: applies local D1 migrations, seeds the
 * fixtures and checks that the running server really has the Builder League flag on. A reused dev server
 * started without `NEXT_DEV_WRANGLER_ENV=staging` fails here with a clear message instead of as dozens of
 * unrelated 404s.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("playwright.config.ts must set baseURL.");

  migrateLocalD1();
  seedLocalData();

  // Community Wrapped is public only while the flag is on, so 200 here proves the flag is on.
  const response = await fetch(new URL("/wrapped/2026", baseURL), { redirect: "manual", signal: AbortSignal.timeout(180_000) });
  if (response.status !== 200) {
    throw new Error(
      `GET /wrapped/2026 returned ${response.status}. The server at ${baseURL} must run with NEXT_DEV_WRANGLER_ENV=staging ` +
        "(BUILDER_LEAGUE_ENABLED=true). Stop any other dev server on that port and rerun."
    );
  }
}
