/**
 * Link existing Polar customers to NLB users by verified email, so existing members see their
 * membership on /account without buying again. Dry run by default; prints counts only, never
 * emails or ids.
 *
 *   npx tsx scripts/onboarding/backfill-customer-links.ts --target local|staging|production
 *   npx tsx scripts/onboarding/backfill-customer-links.ts --target staging --apply
 *   npx tsx scripts/onboarding/backfill-customer-links.ts --target production --apply --confirm-production
 *
 * `--apply` exports a D1 backup first and aborts if that fails. The /account and onboarding pages
 * also link on the fly when a member signs in, so this backfill is optional and safe to rerun.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupTarget } from "../migrate/lib/import-and-verify";
import { d1Query, parseTarget, wrangler } from "../migrate/lib/migration-environment";
import { LINK_CANDIDATES_SQL, LINK_SUMMARY_SQL, linkStatements, type LinkCandidate } from "./backfill-customer-links-sql";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const target = parseTarget(flag("--target"));
  const apply = process.argv.includes("--apply");
  if (target === "production" && apply && !process.argv.includes("--confirm-production")) {
    throw new Error("Refusing to write production D1 without --confirm-production");
  }

  const [summary] = d1Query<Record<string, number>>(LINK_SUMMARY_SQL, target);
  const candidates = d1Query<LinkCandidate>(LINK_CANDIDATES_SQL, target);
  console.log(
    `target=${target} customers=${summary?.customers ?? 0} already_linked=${summary?.already_linked ?? 0} ` +
      `no_verified_user=${summary?.no_verified_user ?? 0} linkable=${candidates.length}`
  );

  if (!apply) {
    console.log("dry run: nothing written (pass --apply to link)");
    return;
  }
  if (candidates.length === 0) {
    console.log("nothing to link");
    return;
  }

  backupTarget(target);
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "nlb-backfill-")), "link-customers.sql");
  writeFileSync(file, linkStatements(candidates, Date.now()).join("\n") + "\n");
  wrangler(["d1", "execute", "DB", "--file", file], target);

  const [after] = d1Query<Record<string, number>>(LINK_SUMMARY_SQL, target);
  console.log(`linked: already_linked ${summary?.already_linked ?? 0} -> ${after?.already_linked ?? 0}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
