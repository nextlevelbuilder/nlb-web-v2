/**
 * League snapshots: what the boards read instead of scanning the ledger on every request.
 *
 * Lifecycle of one (board, period type, period key):
 * - provisional: recomputed on demand. A recompute whose eligible-entry hash and ruleset match the
 *   stored snapshot writes nothing, so it is idempotent; otherwise the provisional row is refreshed in
 *   place (guarded by `status = 'provisional'`, so it can never overwrite a final row).
 * - final: written once the period has ended and its ruleset's grace period has passed. A final row is
 *   never modified. Late approvals and corrections that change the result append a new final `revision`
 *   whose `supersedes_id` points at the row it replaces; readers take the highest revision.
 *
 * Concurrency (D1, no interactive transactions): new revisions collide on the unique
 * (board, period_type, period_key, revision) index, and the loser re-reads instead of writing twice.
 */
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { leagueSnapshots, scoreLedger } from "@/lib/db/schema";
import { PERIOD_TYPES, type BoardKey, type PeriodType } from "./types";
import { computeBoards, parseBoardQuery, toPublicBoard, type BoardEntry, type ComputedBoard, type PublicBoard } from "./leaderboards";
import { nextPeriodKey, periodKey, periodRange, previousPeriodKey } from "./time-windows";
import { evaluateRank } from "./ranks";

export type LeagueSnapshot = Omit<typeof leagueSnapshots.$inferSelect, "entries"> & { entries: BoardEntry[] };

const HOUR_MS = 60 * 60 * 1000;

/**
 * Grace after a period ends before its boards become final, per ruleset version. Late moderation in
 * this window still lands in the provisional board; after it, corrections create a new revision.
 */
export const FINALIZE_GRACE_MS: Record<string, number> = { v1: 72 * HOUR_MS, v2: 72 * HOUR_MS };
const DEFAULT_GRACE_MS = 72 * HOUR_MS;

/** A provisional snapshot younger than this is served as is; older ones are recomputed on read. */
export const PROVISIONAL_MAX_AGE_MS = 10 * 60 * 1000;

/** How many already-ended periods per type `finalizeDuePeriods` checks on each run. */
const FINALIZE_LOOKBACK: Record<PeriodType, number> = { week: 4, month: 2, season: 2, year: 1 };

export function graceFor(rulesetVersion: string): number {
  return FINALIZE_GRACE_MS[rulesetVersion] ?? DEFAULT_GRACE_MS;
}

/** True once the period has ended and the grace of the ruleset that scores it has passed. */
export function isFinalizable(periodType: PeriodType, key: string, rulesetVersion: string, now: Date): boolean {
  return now.getTime() > periodRange(periodType, key).end.getTime() + graceFor(rulesetVersion);
}

function asSnapshot(row: typeof leagueSnapshots.$inferSelect): LeagueSnapshot {
  return { ...row, entries: row.entries as BoardEntry[] };
}

export async function getLatestSnapshot(db: AppDb, board: BoardKey, periodType: PeriodType, key: string): Promise<LeagueSnapshot | null> {
  const [row] = await db
    .select()
    .from(leagueSnapshots)
    .where(and(eq(leagueSnapshots.board, board), eq(leagueSnapshots.periodType, periodType), eq(leagueSnapshots.periodKey, key)))
    .orderBy(desc(leagueSnapshots.revision))
    .limit(1);
  return row ? asSnapshot(row) : null;
}

/** Every revision of one board period, oldest first (audit trail). */
export async function getSnapshotRevisions(db: AppDb, board: BoardKey, periodType: PeriodType, key: string): Promise<LeagueSnapshot[]> {
  const rows = await db
    .select()
    .from(leagueSnapshots)
    .where(and(eq(leagueSnapshots.board, board), eq(leagueSnapshots.periodType, periodType), eq(leagueSnapshots.periodKey, key)))
    .orderBy(leagueSnapshots.revision);
  return rows.map(asSnapshot);
}

function isUniqueViolation(err: unknown): boolean {
  for (let current: unknown = err, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error && /UNIQUE constraint failed/i.test(current.message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

export type SnapshotWrite = "unchanged" | "created" | "refreshed" | "finalized" | "revised";

export interface SnapshotResult {
  snapshot: LeagueSnapshot;
  write: SnapshotWrite;
}

async function insertRevision(
  db: AppDb,
  computed: ComputedBoard,
  revision: number,
  status: "provisional" | "final",
  supersedesId: string | null,
  now: Date
): Promise<LeagueSnapshot | null> {
  try {
    const [row] = await db
      .insert(leagueSnapshots)
      .values({
        id: crypto.randomUUID(),
        board: computed.board,
        periodType: computed.periodType,
        periodKey: computed.periodKey,
        revision,
        status,
        rulesetVersion: computed.rulesetVersion,
        watermarkAt: now,
        eventHash: computed.eventHash,
        entries: computed.entries,
        supersedesId,
        createdAt: now,
      })
      .returning();
    return asSnapshot(row);
  } catch (err) {
    if (isUniqueViolation(err)) return null; // a concurrent writer took this revision
    throw err;
  }
}

/**
 * Stores one computed board. `finalize` asks for a final snapshot (the caller checked the grace).
 * Returns the stored snapshot and what was written.
 */
async function storeBoard(db: AppDb, computed: ComputedBoard, finalize: boolean, now: Date): Promise<SnapshotResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const latest = await getLatestSnapshot(db, computed.board, computed.periodType, computed.periodKey);
    const same = latest && latest.eventHash === computed.eventHash && latest.rulesetVersion === computed.rulesetVersion;

    if (!latest) {
      const created = await insertRevision(db, computed, 1, finalize ? "final" : "provisional", null, now);
      if (created) return { snapshot: created, write: finalize ? "finalized" : "created" };
      continue;
    }

    if (latest.status === "final") {
      if (same) return { snapshot: latest, write: "unchanged" };
      // A late approval or correction changed a closed period: append a superseding final revision.
      const revised = await insertRevision(db, computed, latest.revision + 1, "final", latest.id, now);
      if (revised) return { snapshot: revised, write: "revised" };
      continue;
    }

    if (same && !finalize) return { snapshot: latest, write: "unchanged" };
    const [row] = await db
      .update(leagueSnapshots)
      .set({
        status: finalize ? "final" : "provisional",
        rulesetVersion: computed.rulesetVersion,
        watermarkAt: now,
        eventHash: computed.eventHash,
        entries: computed.entries,
      })
      .where(and(eq(leagueSnapshots.id, latest.id), eq(leagueSnapshots.status, "provisional")))
      .returning();
    if (row) return { snapshot: asSnapshot(row), write: finalize ? "finalized" : same ? "unchanged" : "refreshed" };
    // Another writer finalized it between the read and the update: re-read.
  }
  const latest = await getLatestSnapshot(db, computed.board, computed.periodType, computed.periodKey);
  if (!latest) throw new Error("league snapshot write did not converge");
  return { snapshot: latest, write: "unchanged" };
}

/**
 * Recomputes every board of a period and stores provisional snapshots. Once the period is past its
 * grace it stores final snapshots instead (and revisions for finals that changed). Idempotent.
 */
export async function recomputePeriod(db: AppDb, periodType: PeriodType, key: string, now = new Date()): Promise<SnapshotResult[]> {
  const boards = await computeBoards(db, periodType, key, now);
  const results: SnapshotResult[] = [];
  for (const computed of boards) {
    const finalize = isFinalizable(periodType, key, computed.rulesetVersion, now);
    results.push(await storeBoard(db, computed, finalize, now));
  }
  return results;
}

/** Recomputes one board of a period (all boards share one read, so this costs the same). */
export async function recomputeSnapshot(db: AppDb, board: BoardKey, periodType: PeriodType, key: string, now = new Date()): Promise<SnapshotResult> {
  const results = await recomputePeriod(db, periodType, key, now);
  return results.find((result) => result.snapshot.board === board)!;
}

/**
 * The snapshot a reader should see: the latest revision when it is final or fresh, otherwise a
 * recompute. A read never writes a final snapshot of a period that is not finalizable yet.
 */
export async function getBoardSnapshot(db: AppDb, board: BoardKey, periodType: PeriodType, key: string, now = new Date()): Promise<LeagueSnapshot> {
  const latest = await getLatestSnapshot(db, board, periodType, key);
  if (latest && (latest.status === "final" || now.getTime() - latest.watermarkAt.getTime() < PROVISIONAL_MAX_AGE_MS)) return latest;
  return (await recomputeSnapshot(db, board, periodType, key, now)).snapshot;
}

export interface BuilderRankingsQuery {
  board?: string | null;
  period?: string | null;
  key?: string | null;
  viewerId: string | null;
  limit?: number;
  now?: Date;
}

export interface BuilderRankings extends PublicBoard {
  board: BoardKey;
  periodType: PeriodType;
  periodKey: string;
  range: { start: string; end: string };
  previousKey: string | null;
  nextKey: string | null;
  snapshot: {
    id: string;
    status: "provisional" | "final";
    revision: number;
    rulesetVersion: string;
    watermarkAt: string;
    eventHash: string;
    supersedesId: string | null;
  };
}

/** A board as members and the API see it: snapshot meta, opted-in entries and the viewer's position. */
export async function getBuilderRankings(db: AppDb, query: BuilderRankingsQuery): Promise<BuilderRankings> {
  const now = query.now ?? new Date();
  const { board, periodType, periodKey: key } = parseBoardQuery(query, now);
  const snapshot = await getBoardSnapshot(db, board, periodType, key, now);
  const view = await toPublicBoard(db, snapshot.entries, query.viewerId, query.limit ?? 50);
  const range = periodRange(periodType, key);
  const currentKey = periodKey(periodType, now);
  return {
    board,
    periodType,
    periodKey: key,
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
    previousKey: periodType === "season" && key === "S0" ? null : previousPeriodKey(periodType, key),
    nextKey: key === currentKey || range.end.getTime() > now.getTime() ? null : nextPeriodKey(periodType, key),
    snapshot: {
      id: snapshot.id,
      status: snapshot.status,
      revision: snapshot.revision,
      rulesetVersion: snapshot.rulesetVersion,
      watermarkAt: snapshot.watermarkAt.toISOString(),
      eventHash: snapshot.eventHash,
      supersedesId: snapshot.supersedesId,
    },
    ...view,
  };
}

export class SnapshotNotDueError extends Error {
  constructor(readonly periodType: PeriodType, readonly periodKey: string) {
    super(`${periodType} ${periodKey} is not finalizable yet.`);
    this.name = "SnapshotNotDueError";
  }
}

/** Finalizes every board of one period. Throws `SnapshotNotDueError` before the grace has passed. */
export async function finalizePeriod(db: AppDb, periodType: PeriodType, key: string, now = new Date()): Promise<SnapshotResult[]> {
  const results = await recomputePeriod(db, periodType, key, now);
  if (results.some((result) => result.snapshot.status !== "final")) throw new SnapshotNotDueError(periodType, key);
  return results;
}

export interface FinalizeSummary {
  periods: { periodType: PeriodType; periodKey: string; writes: Partial<Record<SnapshotWrite, number>> }[];
  ranksEvaluated: number;
  ranksAwarded: number;
}

/** Ended periods to check now: the last `FINALIZE_LOOKBACK[type]` periods before the current one. */
export function duePeriodKeys(periodType: PeriodType, now: Date): string[] {
  const keys: string[] = [];
  let key = periodKey(periodType, now);
  for (let i = 0; i < FINALIZE_LOOKBACK[periodType]; i++) {
    if (periodType === "season" && key === "S0") break;
    key = previousPeriodKey(periodType, key);
    keys.push(key);
  }
  return keys;
}

/**
 * Cron entry point. For each recently ended period that is past its grace, finalizes its boards (or
 * appends revisions when late changes arrived), then evaluates the rank gate of everyone who scored in
 * the finalized weeks. Safe to run repeatedly: unchanged periods write nothing.
 */
export async function finalizeDuePeriods(db: AppDb, now = new Date()): Promise<FinalizeSummary> {
  const summary: FinalizeSummary = { periods: [], ranksEvaluated: 0, ranksAwarded: 0 };
  const rankCandidates = new Set<string>();
  for (const periodType of PERIOD_TYPES) {
    for (const key of duePeriodKeys(periodType, now)) {
      const results = await recomputePeriod(db, periodType, key, now);
      if (results.some((result) => result.snapshot.status !== "final")) continue; // still in grace
      const writes: Partial<Record<SnapshotWrite, number>> = {};
      for (const result of results) writes[result.write] = (writes[result.write] ?? 0) + 1;
      summary.periods.push({ periodType, periodKey: key, writes });
      if (periodType === "week" && results.some((result) => result.write !== "unchanged")) {
        const range = periodRange(periodType, key);
        const rows = await db
          .selectDistinct({ userId: scoreLedger.userId })
          .from(scoreLedger)
          .where(and(gte(scoreLedger.occurredAt, range.start), lte(scoreLedger.occurredAt, range.end)));
        for (const row of rows) rankCandidates.add(row.userId);
      }
    }
  }
  for (const userId of rankCandidates) {
    const result = await evaluateRank(db, userId, { now });
    summary.ranksEvaluated += 1;
    if (result.awarded) summary.ranksAwarded += 1;
  }
  return summary;
}
