/**
 * Import / verify mode selection for the migration CLI (pure, unit tested).
 *
 * - `final-sync`: upsert the Neon snapshot by primary key and never delete. This is the cutover mode,
 *   because rows created on v2 before the sync (sign-ins, webhooks, orders) must survive.
 * - `replace`: delete every migrated table, then insert the snapshot. It wipes D1-only rows, so it is
 *   only for an empty or disposable target and needs `--replace --i-understand`.
 *
 * There is no default: `import` and `all` refuse to run without an explicit mode.
 */

export type ImportMode = "replace" | "final-sync";

/** `exact`: D1 must equal the snapshot. `final-sync`: D1 may hold extra D1-only rows. */
export type VerifyMode = "exact" | "final-sync";

export const IMPORT_MODE_USAGE =
  "import/all need an explicit mode: --final-sync (upsert by primary key, never deletes; use for cutover) " +
  "or --replace --i-understand (deletes every migrated table first; only for an empty/disposable target)";

export class UsageError extends Error {}

export function parseImportMode(argv: readonly string[]): ImportMode {
  const finalSync = argv.includes("--final-sync");
  const replace = argv.includes("--replace");
  const understood = argv.includes("--i-understand");
  if (finalSync && replace) throw new UsageError(`--final-sync and --replace are mutually exclusive. ${IMPORT_MODE_USAGE}`);
  if (finalSync) {
    if (understood) throw new UsageError("--i-understand only applies to --replace");
    return "final-sync";
  }
  if (replace) {
    if (!understood) {
      throw new UsageError("--replace deletes every migrated D1 table (including rows created on v2); add --i-understand to confirm");
    }
    return "replace";
  }
  throw new UsageError(IMPORT_MODE_USAGE);
}

/** Verify is read-only, so it only needs to know whether D1-only extra rows are allowed. */
export function parseVerifyMode(argv: readonly string[]): VerifyMode {
  return argv.includes("--final-sync") ? "final-sync" : "exact";
}

export function verifyModeFor(mode: ImportMode): VerifyMode {
  return mode === "final-sync" ? "final-sync" : "exact";
}
