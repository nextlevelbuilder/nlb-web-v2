import type { Config } from "drizzle-kit";

// Migrations are generated locally and applied with `wrangler d1 migrations apply DB`.
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
} satisfies Config;
