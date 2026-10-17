/**
 * Neon -> Cloudflare D1 migration CLI. See scripts/migrate/README.md.
 *
 *   npx tsx scripts/migrate/run-migration.ts dump
 *   npx tsx scripts/migrate/run-migration.ts convert
 *   npx tsx scripts/migrate/run-migration.ts import  --target local|staging|production (--final-sync | --replace --i-understand)
 *   npx tsx scripts/migrate/run-migration.ts verify  --target local|staging|production [--final-sync]
 *   npx tsx scripts/migrate/run-migration.ts rekey-jwks --target ...
 *   npx tsx scripts/migrate/run-migration.ts all     --target ... (--final-sync | --replace --i-understand) [--skip-dump]
 *
 * `import` and `all` refuse to run without a mode. Production also requires --confirm-production.
 */
import { dumpNeon } from "./lib/dump-neon";
import { convertSnapshot } from "./lib/convert-to-sql";
import { importSnapshot, rekeyJwks, verifyTarget } from "./lib/import-and-verify";
import { parseImportMode, parseVerifyMode, verifyModeFor, type VerifyMode } from "./lib/import-mode";
import { parseTarget, type Target } from "./lib/migration-environment";

const USAGE =
  "usage: run-migration.ts dump | convert | import | verify | rekey-jwks | all  [--target local|staging|production] " +
  "[--final-sync | --replace --i-understand] [--skip-dump] [--confirm-production]";

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

function verifyOrFail(target: Target, mode: VerifyMode): void {
  const failed = verifyTarget(target, mode).filter((result) => !result.ok);
  if (failed.length) throw new Error(`Verify failed for: ${failed.map((result) => result.table).join(", ")}`);
}

function main(): void {
  const command = process.argv[2];
  const argv = process.argv.slice(3);
  switch (command) {
    case "dump":
      dumpNeon();
      return;
    case "convert":
      convertSnapshot();
      return;
    case "import": {
      const mode = parseImportMode(argv);
      importSnapshot(requireTarget(), mode);
      return;
    }
    case "verify":
      verifyOrFail(requireTarget(), parseVerifyMode(argv));
      return;
    case "rekey-jwks":
      rekeyJwks(requireTarget());
      return;
    case "all": {
      // Validate every flag before the first side effect (the Neon dump).
      const mode = parseImportMode(argv);
      const target = requireTarget();
      if (!argv.includes("--skip-dump")) dumpNeon();
      convertSnapshot();
      importSnapshot(target, mode);
      verifyOrFail(target, verifyModeFor(mode));
      return;
    }
    default:
      throw new Error(USAGE);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
