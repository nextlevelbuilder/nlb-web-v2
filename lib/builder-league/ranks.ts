/**
 * Rank gate. Rank is separate from level: lifetime RP is only one requirement next to tenure, SHIP
 * count (or the Contributor path), feedback, help, highlighted work and, for Legend, mentor
 * nominations and a member-share quota (see `rankEligibility` in scoring.ts and the ruleset gates).
 *
 * - A rank is awarded only when every requirement of it and of every lower rank passes. The award is
 *   an append-only `rank_awards` row plus a `builder_events` row of kind `rank`, deduped per rank.
 * - Ranks are never removed automatically. Inactivity is reported as a separate flag.
 * - Membership tier is never an input: Premium and VIP members with the same history get the same rank.
 * - Mentors are users with `role = admin`; only their nominations count.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { builderEvents, mentorNominations, rankAwards, scoreLedger, users } from "@/lib/db/schema";
import { RANK_KEYS, type RankKey } from "./types";
import { getEffectiveRuleset } from "./ruleset";
import { rankEligibility, type RankChecklist, type RankStats } from "./scoring";
import { localYear, periodKey } from "./time-windows";
import { recordBuilderEvent } from "./ledger";

const DAY_MS = 24 * 60 * 60 * 1000;

/** No verified activity for this many days raises the inactivity flag (the rank stays). */
export const INACTIVITY_DAYS = 90;

export type RankAward = typeof rankAwards.$inferSelect;

export const rankIndex = (rank: RankKey) => RANK_KEYS.indexOf(rank);

interface LedgerRow {
  id: string;
  eventId: string;
  awardType: string;
  stage: string;
  rp: number;
  reversesEntryId: string | null;
  occurredAt: Date;
}

/** Award rows that still count: not reversals, not reversed, positive, not manual adjustments. */
function countedRows(rows: readonly LedgerRow[]): LedgerRow[] {
  const reversed = new Set(rows.filter((row) => row.reversesEntryId).map((row) => row.reversesEntryId!));
  return rows.filter((row) => !row.reversesEntryId && !reversed.has(row.id) && row.rp > 0 && row.awardType !== "adjustment");
}

const distinctWeeks = (rows: readonly LedgerRow[]) => new Set(rows.map((row) => periodKey("week", row.occurredAt))).size;

/** The highest rank awarded so far, `apprentice` when none. */
export async function getCurrentRank(db: AppDb, userId: string): Promise<{ rank: RankKey; award: RankAward | null }> {
  const awards = await db.select().from(rankAwards).where(eq(rankAwards.userId, userId));
  let best: RankAward | null = null;
  for (const award of awards) {
    if (!best || rankIndex(award.rank) > rankIndex(best.rank)) best = award;
  }
  return { rank: best?.rank ?? "apprentice", award: best };
}

export interface RankStatsDetail {
  stats: RankStats;
  lastActivityAt: Date | null;
}

/** Gathers the gate inputs from the ledger, events, nominations, account tenure and rank holders. */
export async function getRankStats(db: AppDb, userId: string, now = new Date()): Promise<RankStatsDetail> {
  const ruleset = getEffectiveRuleset(now);
  const rows: LedgerRow[] = await db
    .select({
      id: scoreLedger.id,
      eventId: scoreLedger.eventId,
      awardType: scoreLedger.awardType,
      stage: scoreLedger.stage,
      rp: scoreLedger.rp,
      reversesEntryId: scoreLedger.reversesEntryId,
      occurredAt: scoreLedger.occurredAt,
    })
    .from(scoreLedger)
    .where(eq(scoreLedger.userId, userId));
  const rp = rows.reduce((sum, row) => sum + row.rp, 0);
  const counted = countedRows(rows);
  const ofType = (type: string) => counted.filter((row) => row.awardType === type);

  const [account] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  const joinedAt = account?.createdAt?.getTime() ?? now.getTime();
  const tenureDays = Math.max(0, Math.floor((now.getTime() - joinedAt) / DAY_MS));
  const tenureWeeks = Math.max(1, Math.ceil(tenureDays / 7));

  // Distinct members helped: the counterparty of each verified peer-help event.
  const helpEventIds = ofType("contribute_peer_help").map((row) => row.eventId);
  const helped = new Set<string>();
  for (let i = 0; i < helpEventIds.length; i += 90) {
    const events = await db
      .select({ payload: builderEvents.payload })
      .from(builderEvents)
      .where(inArray(builderEvents.id, helpEventIds.slice(i, i + 90)));
    for (const event of events) {
      const counterparty = event.payload?.counterpartyUserId;
      if (typeof counterparty === "string" && counterparty) helped.add(counterparty);
    }
  }

  const nominationRows = await db
    .select({ rank: mentorNominations.rank, mentors: sql<number>`count(distinct ${mentorNominations.mentorUserId})` })
    .from(mentorNominations)
    .innerJoin(users, eq(users.id, mentorNominations.mentorUserId))
    .where(and(eq(mentorNominations.nomineeUserId, userId), eq(mentorNominations.year, localYear(now)), eq(users.role, "admin")))
    .groupBy(mentorNominations.rank);
  const mentorNominationsByRank: Partial<Record<RankKey, number>> = {};
  for (const row of nominationRows) mentorNominationsByRank[row.rank] = Number(row.mentors);

  const withinRankQuota: Partial<Record<RankKey, boolean>> = {};
  const quotaGates = ruleset.ranks.filter((gate) => gate.maxShareOfMembers !== null);
  if (quotaGates.length > 0) {
    const [participants] = await db.select({ count: sql<number>`count(distinct ${scoreLedger.userId})` }).from(scoreLedger);
    for (const gate of quotaGates) {
      const [holders] = await db
        .select({ count: sql<number>`count(distinct ${rankAwards.userId})` })
        .from(rankAwards)
        .where(and(eq(rankAwards.rank, gate.rank), ne(rankAwards.userId, userId)));
      const total = Number(participants?.count ?? 0);
      withinRankQuota[gate.rank] = total > 0 && (Number(holders?.count ?? 0) + 1) / total <= gate.maxShareOfMembers!;
    }
  }

  const contributorWeeks = distinctWeeks(ofType("contribute_contributor_work"));
  const lastActivity = counted.reduce((max, row) => Math.max(max, row.occurredAt.getTime()), 0);
  return {
    stats: {
      rp,
      tenureDays,
      shipCount: counted.filter((row) => row.stage === "ship").length,
      contributorWeeks,
      isApprovedContributor: contributorWeeks > 0,
      feedbackRate: Math.min(1, distinctWeeks(ofType("contribute_weekly_feedback")) / tenureWeeks),
      weeklyCheckIns: distinctWeeks(counted),
      peopleHelped: helped.size,
      highlightedPosts: ofType("ship_highlighted_post").length,
      hasFeaturedContribution: ofType("contribute_featured").length > 0,
      mentorNominations: mentorNominationsByRank,
      withinRankQuota,
    },
    lastActivityAt: lastActivity > 0 ? new Date(lastActivity) : null,
  };
}

export interface RankEvaluation {
  userId: string;
  rulesetVersion: string;
  stats: RankStats;
  checklist: RankChecklist;
  /** Rank held after this evaluation (never lower than before). */
  currentRank: RankKey;
  /** Rank granted by this call, or null. */
  awarded: RankKey | null;
  /** No verified activity in the last `INACTIVITY_DAYS`. Informational only: ranks are not removed. */
  inactive: boolean;
  lastActivityAt: Date | null;
}

export interface EvaluateRankOptions {
  now?: Date;
  /** Read-only: compute the checklist without awarding. */
  dryRun?: boolean;
  /** Who triggered the evaluation, for the audit trail (defaults to the system). */
  actorId?: string;
}

/**
 * Evaluates the rank gate and, when the member is eligible for a rank above the one they hold, awards
 * it. Idempotent: the rank event is deduped per (member, rank) and the award row id is derived from
 * that event, so concurrent evaluations award once.
 */
export async function evaluateRank(db: AppDb, userId: string, options: EvaluateRankOptions = {}): Promise<RankEvaluation> {
  const now = options.now ?? new Date();
  const ruleset = getEffectiveRuleset(now);
  const { stats, lastActivityAt } = await getRankStats(db, userId, now);
  const checklist = rankEligibility(stats, ruleset);
  const held = await getCurrentRank(db, userId);
  const inactive = !lastActivityAt || now.getTime() - lastActivityAt.getTime() > INACTIVITY_DAYS * DAY_MS;
  const base = { userId, rulesetVersion: ruleset.version, stats, checklist, inactive, lastActivityAt };

  if (options.dryRun || rankIndex(checklist.eligibleRank) <= rankIndex(held.rank)) {
    return { ...base, currentRank: held.rank, awarded: null };
  }

  const rank = checklist.eligibleRank;
  const { event } = await recordBuilderEvent(db, {
    kind: "rank",
    subjectUserId: userId,
    actorUserId: options.actorId ?? null,
    actorRole: "system",
    // Rank events are not stage activity; readers of stage mixes filter on kind = activity.
    stage: "build",
    eventType: `rank_${rank}`,
    source: "system",
    externalEventId: `rank:${rank}`,
    occurredAt: now,
    rulesetVersion: ruleset.version,
    verification: "system_verified",
    visibility: "private",
    payload: { rank },
  });
  const inserted = await db
    .insert(rankAwards)
    .values({
      id: `rank-${event.id}`,
      userId,
      rank,
      rulesetVersion: ruleset.version,
      checklist: checklist as unknown as Record<string, unknown>,
      awardedBy: options.actorId ?? "system",
      eventId: event.id,
      awardedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  return { ...base, currentRank: rank, awarded: inserted.length > 0 ? rank : null };
}

export interface NominationInput {
  nomineeUserId: string;
  mentorUserId: string;
  rank?: RankKey;
  note?: string | null;
  now?: Date;
}

/**
 * Records a mentor nomination (one per mentor, nominee, rank and calendar year). Only admins are
 * mentors; the route enforces it and the rank gate only counts admin nominations.
 */
export async function recordNomination(db: AppDb, input: NominationInput): Promise<{ created: boolean; year: number }> {
  const now = input.now ?? new Date();
  const year = localYear(now);
  const inserted = await db
    .insert(mentorNominations)
    .values({
      id: crypto.randomUUID(),
      nomineeUserId: input.nomineeUserId,
      mentorUserId: input.mentorUserId,
      rank: input.rank ?? "legend",
      year,
      note: input.note ?? null,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  return { created: inserted.length > 0, year };
}
