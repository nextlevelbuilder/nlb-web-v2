/**
 * Builder League backfill of directory launches already in D1 (see lib/builder-league/backfill.ts).
 *
 * For every member who opted in (`builder_privacy.backfill_opt_in`), each published product of an
 * organization they own becomes one system-verified SHIP launch event at its original approval date,
 * scored by the ruleset in force on that date. Idempotent; never creates months without activity.
 * Dry run unless `--apply` is passed.
 *
 * Run (pinned account, never the project .env):
 *   env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=<pinned account id> \
 *     node_modules/.bin/tsx scripts/builder-league/backfill-directory.ts \
 *     --env staging [--apply] [--user <id>[,<id>...]]
 *
 * Take a D1 export first when applying: wrangler d1 export DB --remote --env <env> --output <file>.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createDb } from "@/lib/db";
import { runBackfill } from "@/lib/builder-league/backfill";
import { SYSTEM_ACTOR_ID } from "@/lib/builder-league/moderation";
import { SEED_TARGETS, type SeedEnvironment } from "../seed-ecosystem-products/ecosystem-seed-plan";

interface BackfillArgs {
  env: SeedEnvironment;
  apply: boolean;
  userIds: string[] | undefined;
}

function parseArgs(argv: string[]): BackfillArgs {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const env = value("--env");
  if (env !== "staging" && env !== "production") throw new Error("Pass --env staging or --env production");
  const userIds = value("--user")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return { env, apply: argv.includes("--apply"), userIds: userIds && userIds.length > 0 ? userIds : undefined };
}

/** A throwaway wrangler config that binds only the remote D1 database. */
function writeRemoteConfig(env: SeedEnvironment): string {
  const target = SEED_TARGETS[env];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlb-bl-backfill-"));
  const configPath = path.join(dir, "wrangler.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      name: "nlb-builder-league-backfill",
      compatibility_date: "2025-09-01",
      compatibility_flags: ["nodejs_compat"],
      d1_databases: [{ binding: "DB", database_name: target.databaseName, database_id: target.databaseId, remote: true }],
    })
  );
  return configPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (process.env.CLOUDFLARE_API_TOKEN) throw new Error("Unset CLOUDFLARE_API_TOKEN; use the pinned wrangler OAuth login");
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("Set CLOUDFLARE_ACCOUNT_ID to the pinned account");
  console.log(`${args.apply ? "" : "[dry run] "}backfilling directory launches in ${args.env}${args.userIds ? ` for ${args.userIds.length} member(s)` : ""}`);

  const configPath = writeRemoteConfig(args.env);
  // Run wrangler from the temp dir so no project .env is read.
  process.chdir(path.dirname(configPath));
  const { getPlatformProxy } = await import("wrangler");
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath, envFiles: [], persist: false, remoteBindings: true });
  try {
    const report = await runBackfill(
      createDb(proxy.env.DB),
      { dryRun: !args.apply, ...(args.userIds ? { userIds: args.userIds } : {}) },
      { actorId: SYSTEM_ACTOR_ID, actorRole: "system" }
    );
    for (const user of report.users) {
      if (!user.optedIn) {
        console.log(`${user.userId}: not opted in, skipped`);
        continue;
      }
      for (const item of user.items) {
        console.log(`${user.userId} ${item.productSlug}: ${item.action} ${item.occurredAt} ${item.rulesetVersion} ${item.rp} RP${item.reason ? ` (${item.reason})` : ""}`);
      }
    }
    console.log(JSON.stringify({ env: args.env, dryRun: report.dryRun, importedAt: report.importedAt, totals: report.totals }, null, 2));
  } finally {
    await proxy.dispose();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
