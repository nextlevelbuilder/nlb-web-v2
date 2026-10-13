/**
 * Neon -> Cloudflare D1 migration CLI. See scripts/migrate/README.md.
 *
 *   npx tsx scripts/migrate/run-migration.ts dump
 *   npx tsx scripts/migrate/run-migration.ts convert
 *   npx tsx scripts/migrate/run-migration.ts import  --target local|staging|production
 *   npx tsx scripts/migrate/run-migration.ts verify  --target local|staging|production
 *   npx tsx scripts/migrate/run-migration.ts rekey-jwks --target ...
 *   npx tsx scripts/migrate/run-migration.ts all     --target ... [--skip-dump]
 *
 * Production requires --confirm-production so it cannot run by accident.
 */
import { dumpNeon } from "./lib/dump-neon";
import { convertSnapshot } from "./lib/convert-to-sql";
import { importSnapshot, rekeyJwks, verifyTarget } from "./lib/import-and-verify";
import { parseTarget, type Target } from "./lib/migration-environment";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireTarget(): Target {
  const target = parseTarget(flag("--target"));
  if (target === "production" && !process.argv.includes("--confirm-production")) {
    throw new Error("Refusing to touch production D1 without --confirm-production");
  }
  return target;
}

function verifyOrFail(target: Target): void {
  const failed = verifyTarget(target).filter((result) => !result.ok);
  if (failed.length) throw new Error(`Verify failed for: ${failed.map((result) => result.table).join(", ")}`);
}

function main(): void {
  const command = process.argv[2];
  switch (command) {
    case "dump":
      dumpNeon();
      return;
    case "convert":
      convertSnapshot();
      return;
    case "import":
      importSnapshot(requireTarget());
      return;
    case "verify":
      verifyOrFail(requireTarget());
      return;
    case "rekey-jwks":
      rekeyJwks(requireTarget());
      return;
    case "all": {
      const target = requireTarget();
      if (!process.argv.includes("--skip-dump")) dumpNeon();
      convertSnapshot();
      importSnapshot(target);
      verifyOrFail(target);
      return;
    }
    default:
      throw new Error("usage: run-migration.ts dump|convert|import|verify|rekey-jwks|all [--target t] [--skip-dump] [--confirm-production]");
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
