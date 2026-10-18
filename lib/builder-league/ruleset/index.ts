import { createHash } from "crypto";
import type { Verification } from "../types";
import type { Ruleset } from "./types";
import { rulesetV1 } from "./v1";
import { rulesetV2 } from "./v2";

export type * from "./types";
export { SEASON_EPOCH, SEASON_WEEKS } from "./v1";
export { V2_EFFECTIVE_FROM } from "./v2";

/** Every published ruleset, oldest first. Published rulesets are never edited. */
export const RULESETS: readonly Ruleset[] = [rulesetV1, rulesetV2];

export const LATEST_RULESET_VERSION = RULESETS[RULESETS.length - 1].version;

export function getRuleset(version: string): Ruleset {
  const ruleset = RULESETS.find((r) => r.version === version);
  if (!ruleset) throw new Error(`Unknown Builder League ruleset version: ${version}`);
  return ruleset;
}

/** The ruleset in force at `at`: the newest whose `effectiveFrom` is not after it (v1 before that). */
export function getEffectiveRuleset(at: Date): Ruleset {
  let effective = RULESETS[0];
  for (const ruleset of RULESETS) {
    if (Date.parse(ruleset.effectiveFrom) <= at.getTime()) effective = ruleset;
  }
  return effective;
}

/** JSON with object keys sorted at every depth, so equal definitions always serialise identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The scoring definition that the checksum covers. `effectiveFrom` is excluded: it has its own column
 * in `score_rulesets`, and moving a deploy date does not change how events score.
 */
export function rulesetDefinition(ruleset: Ruleset): Omit<Ruleset, "effectiveFrom"> {
  const { effectiveFrom: _effectiveFrom, ...definition } = ruleset;
  return definition;
}

/** sha256 of the canonical definition. Seeded in `score_rulesets.checksum`; tests pin it. */
export function rulesetChecksum(ruleset: Ruleset): string {
  return createHash("sha256").update(canonicalJson(rulesetDefinition(ruleset))).digest("hex");
}

const VERIFICATION_STRENGTH: Record<Verification, number> = {
  self_reported: 0,
  peer_confirmed: 1,
  moderator_verified: 2,
  system_verified: 2,
};

/** True when `actual` is at least as strong as `required` (moderator and system are equal). */
export function meetsVerification(actual: Verification, required: Verification): boolean {
  return VERIFICATION_STRENGTH[actual] >= VERIFICATION_STRENGTH[required];
}
