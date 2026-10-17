import type { RankGate, Ruleset } from "./types";
import {
  LEAGUE_CONFIG,
  LEVEL_CURVE,
  SEASON_EPOCH,
  SEASON_WEEKS,
  V1_RANKS,
  evidence,
  oncePerProject,
  perMonth,
  perWeek,
  perYear,
} from "./v1";

/**
 * Production deploy date of ruleset v2 (Asia/Ho_Chi_Minh). Placeholder: the orchestrator sets the real
 * deploy date before the production release. Events that occurred before it keep scoring under v1.
 */
export const V2_EFFECTIVE_FROM = "2026-10-20T00:00:00+07:00";

/**
 * v2 keeps the v1 rank thresholds and conditions and adds the Contributor path: approved Contributor
 * weeks may replace the SHIP count, so community helpers have their own route to every rank.
 */
const CONTRIBUTOR_WEEKS: Partial<Record<RankGate["rank"], number>> = { builder: 8, architect: 20, master: 40, legend: 80 };
const V2_RANKS: RankGate[] = V1_RANKS.map((gate) => ({
  ...gate,
  contributorWeeksAlternative: CONTRIBUTOR_WEEKS[gate.rank] ?? null,
}));

/**
 * Ruleset v2: the VALIDATE / BUILD / SHIP / CONTRIBUTE scoring contract. Every SHIP event and every
 * award of 25 RP or more needs moderator or system verification. Never edit a published ruleset;
 * add v3 instead. Its checksum is seeded in `score_rulesets`.
 */
export const rulesetV2: Ruleset = {
  version: "v2",
  effectiveFrom: V2_EFFECTIVE_FROM,
  seasonEpoch: SEASON_EPOCH,
  seasonWeeks: SEASON_WEEKS,
  events: {
    validate_problem_signal: {
      key: "validate_problem_signal", stage: "validate", rp: 10, requiredVerification: "moderator_verified",
      evidence: evidence(false, 200), dedupeScope: "event", caps: [perWeek(3), perMonth(2, "project")],
    },
    validate_interviews: {
      key: "validate_interviews", stage: "validate", rp: 30, requiredVerification: "moderator_verified",
      evidence: evidence(false, 400), dedupeScope: "event", caps: [perWeek(2)],
    },
    validate_waitlist: {
      key: "validate_waitlist", stage: "validate", rp: 25, requiredVerification: "moderator_verified",
      evidence: evidence(true, 120), dedupeScope: "project", caps: [oncePerProject, perMonth(2)],
    },
    validate_wtp_commitment: {
      key: "validate_wtp_commitment", stage: "validate", rp: 60, requiredVerification: "moderator_verified",
      evidence: evidence(true, 200), dedupeScope: "project", caps: [oncePerProject, perYear(6)],
    },
    validate_stop_pivot: {
      key: "validate_stop_pivot", stage: "validate", rp: 40, requiredVerification: "moderator_verified",
      evidence: evidence(false, 300), dedupeScope: "event", caps: [perMonth(1), { window: "lifetime", per: "project", max: 2 }],
    },
    build_scope_cut: {
      key: "build_scope_cut", stage: "build", rp: 20, requiredVerification: "moderator_verified",
      evidence: evidence(false, 200), dedupeScope: "event", caps: [perWeek(1), perMonth(1, "project")],
    },
    build_mvp: {
      key: "build_mvp", stage: "build", rp: 30, requiredVerification: "moderator_verified",
      evidence: evidence(true, 120), dedupeScope: "project", caps: [oncePerProject, perMonth(2)],
    },
    build_first_real_user: {
      key: "build_first_real_user", stage: "build", rp: 50, requiredVerification: "moderator_verified",
      evidence: evidence(true, 120), dedupeScope: "project", caps: [oncePerProject, perMonth(2)],
    },
    build_feedback_improvement: {
      key: "build_feedback_improvement", stage: "build", rp: 25, requiredVerification: "moderator_verified",
      evidence: evidence(true, 150), dedupeScope: "event", caps: [perWeek(1), perMonth(2, "project")],
    },
    ship_public_post: {
      key: "ship_public_post", stage: "ship", rp: 10, requiredVerification: "moderator_verified",
      evidence: evidence(true, 0), dedupeScope: "event", caps: [perWeek(4)],
    },
    ship_highlighted_post: {
      key: "ship_highlighted_post", stage: "ship", rp: 25, requiredVerification: "moderator_verified",
      evidence: evidence(true, 0), dedupeScope: "event", caps: [perWeek(1)],
    },
    ship_product_launch: {
      key: "ship_product_launch", stage: "ship", rp: 100, requiredVerification: "moderator_verified",
      evidence: evidence(true, 120), dedupeScope: "project", caps: [oncePerProject, perYear(4)],
    },
    ship_first_payment: {
      key: "ship_first_payment", stage: "ship", rp: 100, requiredVerification: "moderator_verified",
      evidence: evidence(true, 80), dedupeScope: "project", caps: [oncePerProject, perYear(4)],
    },
    ship_distribution_case_study: {
      key: "ship_distribution_case_study", stage: "ship", rp: 35, requiredVerification: "moderator_verified",
      evidence: evidence(true, 300), dedupeScope: "event", caps: [perMonth(2)],
    },
    contribute_peer_help: {
      key: "contribute_peer_help", stage: "contribute", rp: 8, requiredVerification: "peer_confirmed",
      evidence: evidence(false, 80, true), dedupeScope: "event", caps: [perWeek(3), perWeek(1, "counterparty")],
    },
    contribute_weekly_feedback: {
      key: "contribute_weekly_feedback", stage: "contribute", rp: 5, requiredVerification: "system_verified",
      evidence: evidence(false, 0), dedupeScope: "event", caps: [perWeek(1)],
    },
    contribute_contributor_work: {
      key: "contribute_contributor_work", stage: "contribute", rp: 15, requiredVerification: "moderator_verified",
      evidence: evidence(false, 120), dedupeScope: "event", caps: [perWeek(1)],
    },
    contribute_discord_active: {
      key: "contribute_discord_active", stage: "contribute", rp: 3, requiredVerification: "system_verified",
      evidence: evidence(false, 0), dedupeScope: "event", caps: [perWeek(1)],
    },
    contribute_featured: {
      key: "contribute_featured", stage: "contribute", rp: 50, requiredVerification: "moderator_verified",
      evidence: evidence(true, 0), dedupeScope: "event", caps: [perMonth(1)],
    },
  },
  level: LEVEL_CURVE,
  ranks: V2_RANKS,
  noAutoDowngrade: true,
  league: LEAGUE_CONFIG,
};
