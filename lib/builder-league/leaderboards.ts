/**
 * Builder League boards: `overall`, one per stage, `rising` and `newcomers`, each per week, month,
 * season and year (Asia/Ho_Chi_Minh periods).
 *
 * Inputs are `score_ledger` rows only. Every ledger row is already a verified award (the ledger refuses
 * unverified events), and reversals carry the original `occurred_at`, so summing a period nets them out.
 * Membership tier is never read here: Premium and VIP members rank by the same numbers.
 *
 * Computation ranks every member who scored. Public exposure is applied on read (`toPublicBoard`), from
 * the current `builder_privacy` opt-ins, so an opt-out takes effect immediately even on final snapshots,
 * and the viewer always sees their own position privately.
 */
import { createHash } from "crypto";
import { and, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { builderPrivacy, scoreLedger, users } from "@/lib/db/schema";
import { STAGES, isBoardKey, isPeriodType, isStage, type BoardKey, type PeriodType, type Stage } from "./types";
import { getEffectiveRuleset, type Ruleset } from "./ruleset";
import { compareForRanking, leagueScore, type LeagueEntry } from "./scoring";
import { periodKey, periodRange, previousPeriodKey, type PeriodRange } from "./time-windows";
import { BuilderApiError } from "./http";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Newcomers: members whose first ledger entry is at most this many days before the period start. */
export const NEWCOMER_WINDOW_DAYS = 90;

/** Rising: verified events a member needs in the current period before an improvement counts. */
export const RISING_MIN_EVENTS = 2;

export interface BoardEntry {
  userId: string;
  /** 1-based position among every member who scored on this board. */
  position: number;
  score: number;
  /** Capped raw RP per stage in the period (League Score components). */
  components: Record<Stage, number>;
  verifiedEventCount: number;
  /** Epoch ms of the last counted event (tie-breaker: earlier wins). */
  reachedAt: number;
  /** Rising only: score of the previous period. */
  previousScore?: number;
}

export interface ComputedBoard {
  board: BoardKey;
  periodType: PeriodType;
  periodKey: string;
  rulesetVersion: string;
  /** sha256 of the ruleset version and the sorted ledger entry ids that fed the board. */
  eventHash: string;
  entries: BoardEntry[];
}

/** One ledger row as the boards read it. */
interface LedgerRow {
  id: string;
  userId: string;
  stage: Stage;
  rp: number;
  awardType: string;
  reversesEntryId: string | null;
  occurredAt: Date;
}

interface MemberPeriod {
  userId: string;
  entries: LeagueEntry[];
  /** Award rows that count (not reversals, not reversed, positive RP), per stage. */
  counted: LedgerRow[];
  ids: string[];
}

export function parseBoardQuery(input: { board?: string | null; period?: string | null; key?: string | null }, now = new Date()) {
  const board = input.board ?? "overall";
  const periodType = input.period ?? "week";
  if (!isBoardKey(board)) throw new BuilderApiError(400, "invalid_board", "Unknown board.");
  if (!isPeriodType(periodType)) throw new BuilderApiError(400, "invalid_period", "Unknown period type.");
  const key = input.key || periodKey(periodType, now);
  let range: PeriodRange;
  try {
    range = periodRange(periodType, key);
  } catch {
    throw new BuilderApiError(400, "invalid_period_key", "Invalid period key.");
  }
  // Boards exist for the current and past periods only (no snapshots of the future).
  if (range.start.getTime() > now.getTime()) throw new BuilderApiError(400, "future_period", "That period has not started yet.");
  return { board: board as BoardKey, periodType: periodType as PeriodType, periodKey: key };
}

/** The ruleset that scores a period: the one in force at its end, or now while it is still open. */
export function rulesetForPeriod(range: PeriodRange, now: Date): Ruleset {
  return getEffectiveRuleset(new Date(Math.min(range.end.getTime(), now.getTime())));
}

async function loadLedger(db: AppDb, range: PeriodRange): Promise<LedgerRow[]> {
  return db
    .select({
      id: scoreLedger.id,
      userId: scoreLedger.userId,
      stage: scoreLedger.stage,
      rp: scoreLedger.rp,
      awardType: scoreLedger.awardType,
      reversesEntryId: scoreLedger.reversesEntryId,
      occurredAt: scoreLedger.occurredAt,
    })
    .from(scoreLedger)
    .where(and(gte(scoreLedger.occurredAt, range.start), lte(scoreLedger.occurredAt, range.end)));
}

function groupByMember(rows: readonly LedgerRow[]): Map<string, MemberPeriod> {
  const reversed = new Set(rows.filter((row) => row.reversesEntryId).map((row) => row.reversesEntryId!));
  const members = new Map<string, MemberPeriod>();
  for (const row of rows) {
    if (!isStage(row.stage)) continue;
    let member = members.get(row.userId);
    if (!member) {
      member = { userId: row.userId, entries: [], counted: [], ids: [] };
      members.set(row.userId, member);
    }
    member.entries.push({ stage: row.stage, rp: row.rp });
    member.ids.push(row.id);
    if (!row.reversesEntryId && !reversed.has(row.id) && row.rp > 0) member.counted.push(row);
  }
  return members;
}

const lastAt = (rows: readonly LedgerRow[]) => rows.reduce((max, row) => Math.max(max, row.occurredAt.getTime()), 0);

function rankEntries(candidates: Omit<BoardEntry, "position">[]): BoardEntry[] {
  return candidates
    .sort((a, b) => compareForRanking({ ...a }, { ...b }))
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

function hashOf(rulesetVersion: string, ids: Iterable<string>): string {
  return createHash("sha256").update([rulesetVersion, ...[...ids].sort()].join("\n")).digest("hex");
}

/** First ledger entry per member, for the newcomer window. */
async function firstEntryAt(db: AppDb, userIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (let i = 0; i < userIds.length; i += 90) {
    const chunk = userIds.slice(i, i + 90);
    const rows = await db
      .select({ userId: scoreLedger.userId, first: sql<number>`min(${scoreLedger.occurredAt})` })
      .from(scoreLedger)
      .where(inArray(scoreLedger.userId, chunk))
      .groupBy(scoreLedger.userId);
    for (const row of rows) result.set(row.userId, Number(row.first));
  }
  return result;
}

/** Whether members have any ledger entry before `before` (Rising needs prior history). */
async function hasHistoryBefore(db: AppDb, userIds: string[], before: Date): Promise<Set<string>> {
  const result = new Set<string>();
  for (let i = 0; i < userIds.length; i += 90) {
    const chunk = userIds.slice(i, i + 90);
    const rows = await db
      .selectDistinct({ userId: scoreLedger.userId })
      .from(scoreLedger)
      .where(and(inArray(scoreLedger.userId, chunk), lt(scoreLedger.occurredAt, before)));
    for (const row of rows) result.add(row.userId);
  }
  return result;
}

/**
 * Computes every board of one period from a single ledger read (plus the previous period for Rising
 * and first-entry dates for newcomers). Pure apart from the reads; the clock only picks the ruleset of
 * a still-open period.
 */
export async function computeBoards(db: AppDb, periodType: PeriodType, key: string, now = new Date()): Promise<ComputedBoard[]> {
  const range = periodRange(periodType, key);
  const ruleset = rulesetForPeriod(range, now);
  const members = groupByMember(await loadLedger(db, range));
  const allIds = [...members.values()].flatMap((member) => member.ids);
  const base = { periodType, periodKey: key, rulesetVersion: ruleset.version };

  const scored = [...members.values()].map((member) => ({ member, score: leagueScore(member.entries, ruleset, periodType) }));
  const boards: ComputedBoard[] = [];

  const overall = rankEntries(
    scored
      .filter(({ score }) => score.total > 0)
      .map(({ member, score }) => ({
        userId: member.userId,
        score: score.total,
        components: score.components,
        verifiedEventCount: member.counted.length,
        reachedAt: lastAt(member.counted),
      }))
  );
  boards.push({ ...base, board: "overall", eventHash: hashOf(ruleset.version, allIds), entries: overall });

  for (const stage of STAGES) {
    const entries = rankEntries(
      scored
        .filter(({ score }) => score.components[stage] > 0)
        .map(({ member, score }) => {
          const counted = member.counted.filter((row) => row.stage === stage);
          return {
            userId: member.userId,
            score: score.components[stage],
            components: score.components,
            verifiedEventCount: counted.length,
            reachedAt: lastAt(counted),
          };
        })
    );
    const ids = [...members.values()].flatMap((member) => member.ids.filter((_, i) => member.entries[i].stage === stage));
    boards.push({ ...base, board: stage, eventHash: hashOf(ruleset.version, ids), entries });
  }

  // Rising: improvement over the member's own previous period, with an activity floor and prior history.
  let previous: Map<string, MemberPeriod> = new Map();
  let previousIds: string[] = [];
  if (!(periodType === "season" && key === "S0")) {
    const previousRange = periodRange(periodType, previousPeriodKey(periodType, key));
    previous = groupByMember(await loadLedger(db, previousRange));
    previousIds = [...previous.values()].flatMap((member) => member.ids);
  }
  const active = scored.filter(({ member, score }) => score.total > 0 && member.counted.length >= RISING_MIN_EVENTS);
  const veterans = await hasHistoryBefore(db, active.map(({ member }) => member.userId), range.start);
  const rising = rankEntries(
    active.flatMap(({ member, score }) => {
      if (!veterans.has(member.userId)) return [];
      const before = previous.get(member.userId);
      const previousScore = before ? leagueScore(before.entries, ruleset, periodType).total : 0;
      const delta = Math.round((score.total - previousScore) * 100) / 100;
      if (delta <= 0) return [];
      return [{
        userId: member.userId,
        score: delta,
        components: score.components,
        verifiedEventCount: member.counted.length,
        reachedAt: lastAt(member.counted),
        previousScore,
      }];
    })
  );
  boards.push({ ...base, board: "rising", eventHash: hashOf(ruleset.version, [...allIds, ...previousIds]), entries: rising });

  // Newcomers: first ledger entry no earlier than NEWCOMER_WINDOW_DAYS before the period start.
  const windowStart = range.start.getTime() - NEWCOMER_WINDOW_DAYS * DAY_MS;
  const firsts = await firstEntryAt(db, overall.map((entry) => entry.userId));
  const newcomers = rankEntries(
    overall
      .filter((entry) => (firsts.get(entry.userId) ?? 0) >= windowStart)
      .map(({ position: _position, ...entry }) => entry)
  );
  const newcomerIds = [...members.values()]
    .filter((member) => (firsts.get(member.userId) ?? 0) >= windowStart)
    .flatMap((member) => member.ids);
  boards.push({ ...base, board: "newcomers", eventHash: hashOf(ruleset.version, newcomerIds), entries: newcomers });

  return boards;
}

export async function computeBoard(db: AppDb, board: BoardKey, periodType: PeriodType, key: string, now = new Date()): Promise<ComputedBoard> {
  const boards = await computeBoards(db, periodType, key, now);
  return boards.find((b) => b.board === board)!;
}

// ---------------------------------------------------------------------------
// Public view
// ---------------------------------------------------------------------------

export interface PublicBoardEntry {
  /** Position among publicly listed members (1-based, no gaps). */
  rank: number;
  userId: string;
  name: string;
  image: string | null;
  score: number;
  components: Record<Stage, number>;
  verifiedEventCount: number;
  previousScore?: number;
}

export interface ViewerPosition {
  /** Position among every member who scored, including private ones. Visible only to the viewer. */
  position: number;
  outOf: number;
  score: number;
  components: Record<Stage, number>;
  verifiedEventCount: number;
  isPublic: boolean;
  previousScore?: number;
}

export interface PublicBoard {
  entries: PublicBoardEntry[];
  viewer: ViewerPosition | null;
}

/**
 * Applies the current leaderboard opt-ins: only members with `leaderboard_public` are listed, numbered
 * among themselves so private members leave no gaps. The viewer's own position is returned separately.
 */
export async function toPublicBoard(db: AppDb, entries: readonly BoardEntry[], viewerId: string | null, limit = 50): Promise<PublicBoard> {
  const ids = entries.map((entry) => entry.userId);
  const publicIds = new Set<string>();
  const profiles = new Map<string, { name: string; image: string | null }>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await db
      .select({ userId: builderPrivacy.userId, leaderboardPublic: builderPrivacy.leaderboardPublic })
      .from(builderPrivacy)
      .where(inArray(builderPrivacy.userId, chunk));
    for (const row of rows) if (row.leaderboardPublic) publicIds.add(row.userId);
  }
  const listed = entries.filter((entry) => publicIds.has(entry.userId)).slice(0, limit);
  const profileIds = listed.map((entry) => entry.userId);
  for (let i = 0; i < profileIds.length; i += 90) {
    const rows = await db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(users)
      .where(inArray(users.id, profileIds.slice(i, i + 90)));
    for (const row of rows) profiles.set(row.id, { name: row.name, image: row.image ?? null });
  }
  const own = viewerId ? entries.find((entry) => entry.userId === viewerId) : undefined;
  return {
    entries: listed.flatMap((entry, index) => {
      const profile = profiles.get(entry.userId);
      if (!profile) return [];
      return [{
        rank: index + 1,
        userId: entry.userId,
        name: profile.name,
        image: profile.image,
        score: entry.score,
        components: entry.components,
        verifiedEventCount: entry.verifiedEventCount,
        ...(entry.previousScore === undefined ? {} : { previousScore: entry.previousScore }),
      }];
    }).map((entry, index) => ({ ...entry, rank: index + 1 })),
    viewer: own
      ? {
          position: own.position,
          outOf: entries.length,
          score: own.score,
          components: own.components,
          verifiedEventCount: own.verifiedEventCount,
          isPublic: publicIds.has(own.userId),
          ...(own.previousScore === undefined ? {} : { previousScore: own.previousScore }),
        }
      : null,
  };
}
