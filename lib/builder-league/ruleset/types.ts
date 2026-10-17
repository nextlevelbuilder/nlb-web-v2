import type { EventTypeKey, PeriodType, RankKey, Stage, Verification } from "../types";

/**
 * What evidence a submission must carry before a moderator may approve it. Piece-level validation
 * (evidence form, API) enforces these; the ledger enforces only `requiredVerification`.
 */
export interface EvidenceRequirements {
  /** At least one public link or private evidence file is required. */
  linkRequired: boolean;
  /** Minimum length of the written summary, in characters. */
  minSummaryLength: number;
  /** The named counterparty (helped member, customer contact) must confirm before approval. */
  counterpartyConfirmation: boolean;
}

/**
 * How the ledger dedupe key is built for an award:
 * - `event`: one award per source event (`source|externalEventId`);
 * - `project`: one award per project for the lifetime of the project (first payment, launch).
 */
export type DedupeScope = "event" | "project";

/** Calendar window of a cap, in Asia/Ho_Chi_Minh time; `lifetime` never resets. */
export type CapWindow = "week" | "month" | "year" | "lifetime";

/**
 * `user`: all awards of this type for the member. `project`: per project of the member.
 * `counterparty`: per (member, counterparty) pair, e.g. one peer-help award per pair per week.
 */
export type CapScope = "user" | "project" | "counterparty";

export interface CapRule {
  window: CapWindow;
  per: CapScope;
  /** Maximum RP-awarding entries of this type inside one window and scope. */
  max: number;
}

export interface EventDefinition {
  key: EventTypeKey;
  stage: Stage;
  /** RP awarded per accepted event. */
  rp: number;
  /** Minimum verification level; `moderator_verified` and `system_verified` are equally strong. */
  requiredVerification: Verification;
  evidence: EvidenceRequirements;
  dedupeScope: DedupeScope;
  /** Every cap must hold; at least one per event type. */
  caps: CapRule[];
}

/** Level n (n ≥ 2) needs `round(base · (n − 1)^exponent)` lifetime RP; level 1 starts at 0 RP. */
export interface LevelCurve {
  base: number;
  exponent: number;
  maxLevel: number;
}

export interface RankGate {
  rank: RankKey;
  minRp: number;
  /** Days since joining (first paid membership or account creation, whichever the caller supplies). */
  minTenureDays: number;
  /** Verified SHIP-stage events. */
  minShipCount: number;
  /**
   * Approved Contributor weeks that may replace `minShipCount` (the Contributor path).
   * Null when the gate has no Contributor alternative.
   */
  contributorWeeksAlternative: number | null;
  /** Share (0–1) of weeks since joining with a submitted weekly feedback. */
  minFeedbackRate: number;
  minWeeklyCheckIns: number;
  /** Distinct members helped with verified peer help. */
  minPeopleHelped: number;
  minHighlightedPosts: number;
  /** Needs a featured contribution or approved Contributor status. */
  requiresFeaturedOrContributor: boolean;
  /** Distinct mentor nominations for this rank in the current calendar year. */
  minMentorNominations: number;
  /** Upper bound on the share of members holding this rank (Legend ≤ 5 %); null = unbounded. */
  maxShareOfMembers: number | null;
}

export interface LeagueConfig {
  /** Weights of the overall League Score; they sum to 1. */
  weights: Record<Stage, number>;
  /**
   * Raw RP per stage that maps to a normalised 100 in one period. Raw component values above the cap
   * count as the cap, so one stage cannot be farmed without limit.
   */
  componentCaps: Record<PeriodType, Record<Stage, number>>;
}

export interface Ruleset {
  version: string;
  /** ISO instant with explicit +07:00 offset. */
  effectiveFrom: string;
  /** Monday 00:00 Asia/Ho_Chi_Minh of season 1; seasons are 8 ISO weeks. */
  seasonEpoch: string;
  seasonWeeks: number;
  events: Partial<Record<EventTypeKey, EventDefinition>>;
  level: LevelCurve;
  ranks: RankGate[];
  /** Ranks are never removed automatically; inactivity is a separate flag. */
  noAutoDowngrade: true;
  league: LeagueConfig;
}
