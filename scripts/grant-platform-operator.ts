/**
 * Print the SQL and the pinned wrangler command that grant platform operator capabilities to a user.
 * Bootstrap only: the first operator cannot be approved by a second one. Later grants go through the
 * `operator.grant` approval flow. Prints nothing secret and writes nothing itself.
 *
 *   npx tsx scripts/grant-platform-operator.ts --user <userId> --capability live:manage \
 *     [--capability system:manage] [--granted-by <userId>] [--note "why"] [--env local|staging|production]
 *
 * The capability list replaces the operator's current list and clears any revocation.
 * Run it from the repo root; run the printed command yourself after taking a D1 export
 * (docs/deployment-guide.md).
 */
import { bootstrapGrantSql } from "@/lib/operators/operator-bootstrap-sql";

const PINNED_ACCOUNT_ID = "7ac87c90789159ae1b10b7d78f5dcc08";
const ENV_FLAGS: Record<string, string> = { local: "--local", staging: "--remote --env staging", production: '--remote --env=""' };

function readFlags(argv: string[]): Map<string, string[]> {
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!name.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Expected "--flag value", got "${name}"`);
    }
    flags.set(name.slice(2), [...(flags.get(name.slice(2)) ?? []), value]);
    i++;
  }
  return flags;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function main(): void {
  const flags = readFlags(process.argv.slice(2));
  const userId = flags.get("user")?.[0];
  const env = flags.get("env")?.[0] ?? "local";
  if (!userId) throw new Error("--user is required");
  if (!ENV_FLAGS[env]) throw new Error("--env must be local, staging or production");

  const sql = bootstrapGrantSql({
    userId,
    capabilities: flags.get("capability") ?? [],
    grantedBy: flags.get("granted-by")?.[0] ?? "bootstrap",
    note: flags.get("note")?.[0] ?? null,
    nowMs: Date.now(),
  });
  const execute = `d1 execute DB ${ENV_FLAGS[env]} --command ${shellQuote(sql)}`;
  const repo = shellQuote(process.cwd());
  // Remote runs follow the deployment guide: outside the repo (no .env token), account pinned.
  const command =
    env === "local"
      ? `node_modules/.bin/wrangler ${execute}`
      : `(cd "$(mktemp -d)" && env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=${PINNED_ACCOUNT_ID} ` +
        `${repo}/node_modules/.bin/wrangler --config ${repo}/wrangler.jsonc ${execute})`;

  console.log(`-- SQL\n${sql}\n\n-- Command (${env})\n${command}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
