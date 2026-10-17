/**
 * Shared vocabulary of the Builder League. Every piece imports these names; they mirror the text values
 * stored in the D1 tables of `lib/db/builder-league-schema.ts`.
 */

export const STAGES = ["validate", "build", "ship", "contribute"] as const;
export type Stage = (typeof STAGES)[number];

/** Every scorable activity across all rulesets. A ruleset may define a subset. */
export const EVENT_TYPE_KEYS = [
  "validate_problem_signal",
  "validate_interviews",
  "validate_waitlist",
  "validate_wtp_commitment",
  "validate_stop_pivot",
  "build_scope_cut",
  "build_mvp",
  "build_first_real_user",
  "build_feedback_improvement",
  "ship_public_post",
  "ship_highlighted_post",
  "ship_product_launch",
  "ship_first_payment",
  "ship_distribution_case_study",
  "contribute_peer_help",
  "contribute_weekly_feedback",
  "contribute_contributor_work",
  "contribute_discord_active",
  "contribute_featured",
] as const;
export type EventTypeKey = (typeof EVENT_TYPE_KEYS)[number];

export const VERIFICATIONS = ["self_reported", "peer_confirmed", "moderator_verified", "system_verified"] as const;
export type Verification = (typeof VERIFICATIONS)[number];

export const VISIBILITIES = ["private", "community", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const EVIDENCE_STATUSES = ["submitted", "needs_info", "approved", "rejected", "withdrawn"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const EVENT_SOURCES = ["member", "api", "agent", "moderator", "system", "backfill", "discord", "directory"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const BOARD_KEYS = ["overall", ...STAGES, "rising", "newcomers"] as const;
export type BoardKey = "overall" | Stage | "rising" | "newcomers";

export const PERIOD_TYPES = ["week", "month", "year", "season"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const RANK_KEYS = ["apprentice", "builder", "architect", "master", "legend"] as const;
export type RankKey = (typeof RANK_KEYS)[number];

/** `builder_events.kind`. Corrections and reversals are new rows; nothing is edited in place. */
export const BUILDER_EVENT_KINDS = ["activity", "reversal", "correction", "adjustment", "rank", "badge", "backfill"] as const;
export type BuilderEventKind = (typeof BUILDER_EVENT_KINDS)[number];

/**
 * Who performed an action. `api` (API key) and `agent` (MCP delegation) callers may only submit:
 * they never verify, approve or award. `member` is a signed-in human acting for themselves.
 */
export const ACTOR_ROLES = ["member", "api", "agent", "moderator", "admin", "system"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** Roles allowed to turn an event into RP (award, reverse). */
export const AWARDING_ROLES: readonly ActorRole[] = ["moderator", "admin", "system"];

/** Public surfaces that each need their own opt-in in `builder_privacy`. */
export type PrivacySurface = "leaderboard" | "passport" | "wrapped" | "peer_mentions";

/** Community membership tier derived from commerce. It never changes RP, rank or League Score. */
export type CommunityTier = "none" | "premium" | "vip";

/**
 * Known keys of `builder_events.payload`. Pieces may add more; the ledger only reads these.
 * `rp` is used by `adjustment` events only (signed, admin-issued).
 */
export interface BuilderEventPayload {
  counterpartyUserId?: string | null;
  rp?: number;
  note?: string;
  [key: string]: unknown;
}

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

export function isEventTypeKey(value: string): value is EventTypeKey {
  return (EVENT_TYPE_KEYS as readonly string[]).includes(value);
}

export function isPeriodType(value: string): value is PeriodType {
  return (PERIOD_TYPES as readonly string[]).includes(value);
}

export function isBoardKey(value: string): value is BoardKey {
  return (BOARD_KEYS as readonly string[]).includes(value);
}

/** Prefix of the subject id that replaces a member's id in kept history after a privacy delete. */
export const TOMBSTONE_USER_PREFIX = "deleted-";

/** Tombstoned subjects have no `users` row, so per-user writes (ranks, yearly snapshots) must skip them. */
export function isTombstoneUserId(userId: string): boolean {
  return userId.startsWith(TOMBSTONE_USER_PREFIX);
}
