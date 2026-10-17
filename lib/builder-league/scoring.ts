import { STAGES, type EventTypeKey, type PeriodType, type RankKey, type Stage } from "./types";
import type { CapRule, Ruleset } from "./ruleset";
import { periodKey } from "./time-windows";

/**
 * Pure scoring functions. Nothing here reads the database or the clock, so snapshots and yearly
 * archives recompute to the same numbers under the ruleset they recorded.
 */

// ---------------------------------------------------------------------------
// Level (pure view of lifetime RP)
// ---------------------------------------------------------------------------

/** Lifetime RP needed to reach `level` (level 1 starts at 0 RP). Strictly increasing from level 1. */
export function levelThreshold(level: number, ruleset: Ruleset): number {
  if (level <= 1) return 0;
  const { base, exponent } = ruleset.level;
  return Math.round(base * Math.pow(level - 1, exponent));
}

export function levelForRp(rp: number, ruleset: Ruleset): number {
  let level = 1;
  while (level < ruleset.level.maxLevel && levelThreshold(level + 1, ruleset) <= rp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  /** RP at which the current level started. */
  levelStartRp: number;
  /** RP needed for the next level; null at the maximum level. */
  nextLevelRp: number | null;
  rpIntoLevel: number;
  rpToNext: number | null;
  /** 0–1 share of the current level completed (1 at the maximum level). */
  progress: number;
}

export function levelProgress(rp: number, ruleset: Ruleset): LevelProgress {
  const total = Math.max(0, rp);
  const level = levelForRp(total, ruleset);
  const levelStartRp = levelThreshold(level, ruleset);
  const nextLevelRp = level >= ruleset.level.maxLevel ? null : levelThreshold(level + 1, ruleset);
  const rpIntoLevel = total - levelStartRp;
  return {
    level,
    levelStartRp,
    nextLevelRp,
    rpIntoLevel,
    rpToNext: nextLevelRp === null ? null : nextLevelRp - total,
    progress: nextLevelRp === null ? 1 : rpIntoLevel / (nextLevelRp - levelStartRp),
  };
}

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

export interface CapCandidate {
  userId: string;
  eventType: EventTypeKey;
  occurredAt: Date;
  projectId?: string | null;
  counterpartyUserId?: string | null;
}

/** A prior RP-awarding entry; reversed entries do not count against a cap. */
export interface CapPriorEntry extends CapCandidate {
  reversed?: boolean;
}

export type CapDecision =
  | { allowed: true; slotKeys: string[] }
  | { allowed: false; reason: string; rule: CapRule };

function capScopeId(rule: CapRule, candidate: CapCandidate): string | null {
  if (rule.per === "user") return "user";
  if (rule.per === "project") return candidate.projectId ? `project:${candidate.projectId}` : null;
  return candidate.counterpartyUserId ? `counterparty:${candidate.counterpartyUserId}` : null;
}

function capWindowKey(rule: CapRule, at: Date): string {
  return rule.window === "lifetime" ? "lifetime" : `${rule.window}:${periodKey(rule.window as PeriodType, at)}`;
}

/** Deterministic prefix of the cap slots for one rule; append the slot index to get a slot key. */
export function capSlotPrefix(rule: CapRule, candidate: CapCandidate): string | null {
  const scope = capScopeId(rule, candidate);
  if (!scope) return null;
  return `${candidate.userId}|${candidate.eventType}|${scope}|${capWindowKey(rule, candidate.occurredAt)}|`;
}

export function capReason(rule: CapRule): string {
  return `cap_${rule.window}_${rule.per}_${rule.max}`;
}

/**
 * Decides whether a candidate award fits every cap of its event type. Windows are calendar periods of
 * the event's `occurredAt` (Asia/Ho_Chi_Minh), so a late approval lands in the week the work happened.
 *
 * For each rule the candidate claims the lowest free slot index below `max`. A slot is taken when a
 * prior entry already counts against the rule, or when its key is in `takenSlotKeys` (the ledger passes
 * the slots stored in `score_cap_slots`). A `project`/`counterparty` rule without that id is
 * `missing_scope` because the cap cannot be checked.
 */
export function applyCaps(
  candidate: CapCandidate,
  priorEntriesInWindow: readonly CapPriorEntry[],
  ruleset: Ruleset,
  takenSlotKeys: ReadonlySet<string> = new Set()
): CapDecision {
  const definition = ruleset.events[candidate.eventType];
  if (!definition) throw new Error(`Event type ${candidate.eventType} is not defined in ruleset ${ruleset.version}.`);
  const slotKeys: string[] = [];
  for (const rule of definition.caps) {
    const prefix = capSlotPrefix(rule, candidate);
    if (!prefix) return { allowed: false, reason: `missing_scope_${rule.per}`, rule };
    const counted = priorEntriesInWindow.filter(
      (entry) => !entry.reversed && entry.eventType === candidate.eventType && capSlotPrefix(rule, entry) === prefix
    ).length;
    let index = counted;
    while (index < rule.max && takenSlotKeys.has(`${prefix}${index}`)) index += 1;
    if (index >= rule.max) return { allowed: false, reason: capReason(rule), rule };
    slotKeys.push(`${prefix}${index}`);
  }
  return { allowed: true, slotKeys };
}

// ---------------------------------------------------------------------------
// League Score
// ---------------------------------------------------------------------------

export interface LeagueEntry {
  stage: Stage;
  rp: number;
}

export interface LeagueScore {
  /** Weighted overall score, 0–100, two decimals. */
  total: number;
  /** Raw RP per stage, net of reversals, floored at 0 and capped at the period's component cap. */
  components: Record<Stage, number>;
  /** Each component scaled to 0–100 against its cap. */
  normalized: Record<Stage, number>;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * League Score of one member for one period. `entries` must already be filtered to the period and to
 * eligible (verified, non-private-excluded) ledger rows. Stage boards rank by `components[stage]`, so a
 * stage specialist is never penalised for empty stages; the overall board ranks by `total`.
 */
export function leagueScore(entries: readonly LeagueEntry[], ruleset: Ruleset, periodType: PeriodType = "week"): LeagueScore {
  const raw = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
  for (const entry of entries) raw[entry.stage] += entry.rp;
  const caps = ruleset.league.componentCaps[periodType];
  const components = {} as Record<Stage, number>;
  const normalized = {} as Record<Stage, number>;
  let total = 0;
  for (const stage of STAGES) {
    components[stage] = Math.min(Math.max(raw[stage], 0), caps[stage]);
    normalized[stage] = round2((components[stage] / caps[stage]) * 100);
    total += ruleset.league.weights[stage] * (components[stage] / caps[stage]) * 100;
  }
  return { total: round2(total), components, normalized };
}

export interface RankingCandidate {
  userId: string;
  score: number;
  /** Verified events counted in the score. */
  verifiedEventCount: number;
  /** When the member reached `score` (the last counted event); earlier wins. */
  reachedAt: Date | number;
}

/**
 * Board ordering: higher score; then more verified events; then whoever reached the score earlier;
 * then `userId` so the order is total and deterministic.
 */
export function compareForRanking(a: RankingCandidate, b: RankingCandidate): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.verifiedEventCount !== b.verifiedEventCount) return b.verifiedEventCount - a.verifiedEventCount;
  const reachedA = typeof a.reachedAt === "number" ? a.reachedAt : a.reachedAt.getTime();
  const reachedB = typeof b.reachedAt === "number" ? b.reachedAt : b.reachedAt.getTime();
  if (reachedA !== reachedB) return reachedA - reachedB;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Rank eligibility gate
// ---------------------------------------------------------------------------

export interface RankStats {
  rp: number;
  tenureDays: number;
  /** Verified SHIP-stage events. */
  shipCount: number;
  /** Approved Contributor weeks. */
  contributorWeeks: number;
  isApprovedContributor: boolean;
  /** 0–1 share of weeks with a weekly feedback. */
  feedbackRate: number;
  weeklyCheckIns: number;
  peopleHelped: number;
  highlightedPosts: number;
  hasFeaturedContribution: boolean;
  /** Distinct mentor nominations per rank for the current year. */
  mentorNominations: Partial<Record<RankKey, number>>;
  /** Whether granting Legend keeps Legends within the member share cap (computed by the caller). */
  withinRankQuota?: Partial<Record<RankKey, boolean>>;
}

export type RankRequirementKey =
  | "rp"
  | "tenure_days"
  | "ship_or_contributor"
  | "feedback_rate"
  | "weekly_check_ins"
  | "people_helped"
  | "highlighted_posts"
  | "featured_or_contributor"
  | "mentor_nominations"
  | "member_quota";

export interface RankRequirement {
  key: RankRequirementKey;
  required: number | boolean;
  actual: number | boolean;
  met: boolean;
}

export interface RankCheck {
  rank: RankKey;
  eligible: boolean;
  requirements: RankRequirement[];
}

export interface RankChecklist {
  /** Highest rank whose gate and every lower gate are met. */
  eligibleRank: RankKey;
  /** Next rank above `eligibleRank`, or null at Legend. */
  nextRank: RankKey | null;
  checks: RankCheck[];
}

/**
 * Evaluates every rank gate. A rank is eligible only when its own gate and all lower gates pass. The
 * result is a checklist, not an award: ranks are granted by an explicit rank event and are never
 * removed automatically (`ruleset.noAutoDowngrade`).
 */
export function rankEligibility(stats: RankStats, ruleset: Ruleset): RankChecklist {
  const checks: RankCheck[] = ruleset.ranks.map((gate) => {
    const requirements: RankRequirement[] = [];
    const add = (key: RankRequirementKey, required: number | boolean, actual: number | boolean, met: boolean) =>
      requirements.push({ key, required, actual, met });
    const atLeast = (key: RankRequirementKey, required: number, actual: number) => {
      if (required > 0) add(key, required, actual, actual >= required);
    };
    atLeast("rp", gate.minRp, stats.rp);
    atLeast("tenure_days", gate.minTenureDays, stats.tenureDays);
    if (gate.minShipCount > 0) {
      const viaContributor = gate.contributorWeeksAlternative !== null && stats.isApprovedContributor &&
        stats.contributorWeeks >= gate.contributorWeeksAlternative;
      add("ship_or_contributor", gate.minShipCount, stats.shipCount, stats.shipCount >= gate.minShipCount || viaContributor);
    }
    atLeast("feedback_rate", gate.minFeedbackRate, stats.feedbackRate);
    atLeast("weekly_check_ins", gate.minWeeklyCheckIns, stats.weeklyCheckIns);
    atLeast("people_helped", gate.minPeopleHelped, stats.peopleHelped);
    atLeast("highlighted_posts", gate.minHighlightedPosts, stats.highlightedPosts);
    if (gate.requiresFeaturedOrContributor) {
      const actual = stats.hasFeaturedContribution || stats.isApprovedContributor;
      add("featured_or_contributor", true, actual, actual);
    }
    atLeast("mentor_nominations", gate.minMentorNominations, stats.mentorNominations[gate.rank] ?? 0);
    if (gate.maxShareOfMembers !== null) {
      const actual = stats.withinRankQuota?.[gate.rank] ?? false;
      add("member_quota", true, actual, actual);
    }
    return { rank: gate.rank, eligible: requirements.every((r) => r.met), requirements };
  });

  let eligibleIndex = 0;
  for (let i = 1; i < checks.length && checks[i].eligible; i++) eligibleIndex = i;
  return {
    eligibleRank: checks[eligibleIndex].rank,
    nextRank: checks[eligibleIndex + 1]?.rank ?? null,
    checks,
  };
}
