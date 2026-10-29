import { defineConfig } from "@playwright/test";

/**
 * Builder League E2E suite (see docs/builder-league-runbook.md, "E2E").
 *
 * One deterministic dev server on port 3000 (`NEXT_DEV_WRANGLER_ENV=staging`, whose committed vars enable
 * the Builder League). It is reused when already running, so a long local session does not spawn duplicates.
 * Projects are the AGENTS.md viewport matrix (1440x900, 768x1024, 375x812, and 320 px for reflow) crossed
 * with the light and dark color schemes. Locales (EN at `/`, VI at `/vi`) are looped inside the specs.
 */
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
  reflow: { width: 320, height: 640 },
} as const;

const COLOR_SCHEMES = ["light", "dark"] as const;

const projects = (Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]).flatMap((viewport) =>
  COLOR_SCHEMES.map((colorScheme) => ({
    name: `${viewport}-${colorScheme}`,
    use: { viewport: VIEWPORTS[viewport], colorScheme, baseURL },
  }))
);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results",
  fullyParallel: false,
  // Shared local D1 and one dev server: keep the worker count low on a loaded machine.
  workers: 2,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  // Dev-mode compiles of a route take minutes on a loaded machine, so the first visit can be slow.
  timeout: 300_000,
  // A server action or a cold route compile can take well over 20 s in dev mode; assertions keep their meaning.
  expect: { timeout: 120_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    navigationTimeout: 300_000,
    actionTimeout: 30_000,
  },
  globalSetup: "./tests/e2e/fixtures/global-setup.ts",
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    // The first `next dev` compile of this app takes minutes on a loaded machine.
    timeout: 600_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_DEV_WRANGLER_ENV: "staging",
      // Fake Polar product id: lib/env.ts reads process.env, so the seeded VIP subscription maps to VIP here.
      POLAR_PRODUCT_VIP_ANNUAL: "e2e-polar-vip-annual",
    },
  },
  projects,
});
