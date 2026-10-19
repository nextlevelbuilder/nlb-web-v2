import { defineConfig } from "vitest/config";

// Shared by the published workspaces; each package runs it from its own directory.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
