import type { CapRule, EvidenceRequirements, LeagueConfig, LevelCurve, RankGate, Ruleset } from "./types";

/**
 * Ruleset v1: the legacy RP table and rank conditions that applied before v2 (membership-tiers policy
 * as published up to 2026-10-13). It exists so backfilled 2026 history is scored by the rules that
 * applied when it happened. Never edit it: its checksum is seeded in `score_rulesets`.
 *
 * v1 had no written caps. The caps below only encode the cadence already implied by the legacy table
 * ("+5 RP/week") or bound replays of imported history; they never lower a legitimately earned award.
 */

/** Seasons start on Monday 2026-10-19 local time and last 8 ISO weeks. */
export const SEASON_EPOCH = "2026-10-19T00:00:00+07:00";
export const SEASON_WEEKS = 8;

export const LEVEL_CURVE: LevelCurve = { base: 50, exponent: 1.6, maxLevel: 100 };

const WEEK_CAPS = { validate: 120, build: 100, ship: 150, contribute: 40 } as const;
const scaleCaps = (factor: number) => ({
  validate: WEEK_CAPS.validate * factor,
  build: WEEK_CAPS.build * factor,
  ship: WEEK_CAPS.ship * factor,
  contribute: WEEK_CAPS.contribute * factor,
});

export const LEAGUE_CONFIG: LeagueConfig = {
  weights: { validate: 0.35, build: 0.2, ship: 0.35, contribute: 0.1 },
  componentCaps: { week: scaleCaps(1), month: scaleCaps(4), season: scaleCaps(8), year: scaleCaps(40) },
};

export const evidence = (linkRequired: boolean, minSummaryLength: number, counterpartyConfirmation = false): EvidenceRequirements => ({
  linkRequired,
  minSummaryLength,
  counterpartyConfirmation,
});
export const perWeek = (max: number, per: CapRule["per"] = "user"): CapRule => ({ window: "week", per, max });
export const perMonth = (max: number, per: CapRule["per"] = "user"): CapRule => ({ window: "month", per, max });
export const perYear = (max: number, per: CapRule["per"] = "user"): CapRule => ({ window: "year", per, max });
export const oncePerProject: CapRule = { window: "lifetime", per: "project", max: 1 };

const gate = (rank: RankGate["rank"], values: Partial<Omit<RankGate, "rank">>): RankGate => ({
  rank,
  minRp: 0,
  minTenureDays: 0,
  minShipCount: 0,
  contributorWeeksAlternative: null,
  minFeedbackRate: 0,
  minWeeklyCheckIns: 0,
  minPeopleHelped: 0,
  minHighlightedPosts: 0,
  requiresFeaturedOrContributor: false,
  minMentorNominations: 0,
  maxShareOfMembers: null,
  ...values,
});

export const V1_RANKS: RankGate[] = [
  gate("apprentice", {}),
  gate("builder", { minRp: 100, minTenureDays: 45, minShipCount: 8, minFeedbackRate: 0.8, minWeeklyCheckIns: 4 }),
  gate("architect", { minRp: 300, minTenureDays: 90, minShipCount: 20, minFeedbackRate: 0.9, minPeopleHelped: 5, minHighlightedPosts: 2 }),
  gate("master", { minRp: 800, minTenureDays: 180, minShipCount: 50, minFeedbackRate: 0.95, requiresFeaturedOrContributor: true }),
  gate("legend", { minRp: 2000, minTenureDays: 365, minShipCount: 100, minMentorNominations: 2, maxShareOfMembers: 0.05 }),
];

export const rulesetV1: Ruleset = {
  version: "v1",
  effectiveFrom: "2025-01-01T00:00:00+07:00",
  seasonEpoch: SEASON_EPOCH,
  seasonWeeks: SEASON_WEEKS,
  events: {
    ship_public_post: {
      key: "ship_public_post", stage: "ship", rp: 10, requiredVerification: "moderator_verified",
      evidence: evidence(true, 0), dedupeScope: "event", caps: [perWeek(4)],
    },
    ship_highlighted_post: {
      key: "ship_highlighted_post", stage: "ship", rp: 25, requiredVerification: "moderator_verified",
      evidence: evidence(true, 0), dedupeScope: "event", caps: [perWeek(2)],
    },
    contribute_weekly_feedback: {
      key: "contribute_weekly_feedback", stage: "contribute", rp: 5, requiredVerification: "system_verified",
      evidence: evidence(false, 0), dedupeScope: "event", caps: [perWeek(1)],
    },
    contribute_discord_active: {
      key: "contribute_discord_active", stage: "contribute", rp: 3, requiredVerification: "system_verified",
      evidence: evidence(false, 0), dedupeScope: "event", caps: [perWeek(1)],
    },
    contribute_peer_help: {
      key: "contribute_peer_help", stage: "contribute", rp: 8, requiredVerification: "peer_confirmed",
      evidence: evidence(false, 0, true), dedupeScope: "event", caps: [perWeek(5)],
    },
    contribute_contributor_work: {
      key: "contribute_contributor_work", stage: "contribute", rp: 15, requiredVerification: "moderator_verified",
      evidence: evidence(false, 0), dedupeScope: "event", caps: [perWeek(1)],
    },
    contribute_featured: {
      key: "contribute_featured", stage: "contribute", rp: 50, requiredVerification: "moderator_verified",
      evidence: evidence(false, 0), dedupeScope: "event", caps: [perMonth(2)],
    },
    ship_product_launch: {
      key: "ship_product_launch", stage: "ship", rp: 100, requiredVerification: "moderator_verified",
      evidence: evidence(true, 0), dedupeScope: "project", caps: [oncePerProject],
    },
  },
  level: LEVEL_CURVE,
  ranks: V1_RANKS,
  noAutoDowngrade: true,
  league: LEAGUE_CONFIG,
};
