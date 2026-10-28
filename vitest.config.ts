import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup/local-d1-setup.ts"],
    // Each file boots an in-memory Miniflare D1; allow for slow starts on loaded CI runners.
    hookTimeout: 120_000,
    testTimeout: 60_000,
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts", "app/**/*.test.ts"],
    // Playwright specs run under `npm run test:e2e`, never under vitest.
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./"),
    },
  },
});
