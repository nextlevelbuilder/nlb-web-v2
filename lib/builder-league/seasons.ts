/**
 * 8-week seasons counted from the ruleset's `SEASON_EPOCH` (boundaries from `time-windows.ts`).
 *
 * - Enrollment is optional and only adds a track (cohort) and a personal goal; League Score is computed
 *   the same way for everyone.
 * - The weekly check-in is a soft summary of verified progress. A quiet week is shown as quiet, never
 *   punished: there are no streaks, no decay and no penalties.
 * - Archived results come straight from final `league_snapshots` rows with `period_type = 'season'`;
 *   this module does not compute rankings.
 */
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { activityEvidence, leagueSnapshots, seasonEnrollments } from "@/lib/db/schema";
import { BuilderApiError } from "./http";
import { SEASON_WEEKS } from "./ruleset";
import { nextPeriodKey, periodKey, periodRange, previousPeriodKey } from "./time-windows";
import { getVerifiedHistory } from "./verified-history";
import { STAGES, type Stage } from "./types";

export type SeasonEnrollment = typeof seasonEnrollments.$inferSelect;

export const SEASON_TRACKS = ["open", "validate", "build", "ship", "contribute"] as const;
export type SeasonTrack = (typeof SEASON_TRACKS)[number];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const SEASON_GOAL_MAX = 280;

export interface SeasonInfo {
  key: string;
  number: number;
  start: string;
  /** Inclusive last millisecond. */
  end: string;
  /** 1..8 while the season runs; 0 before it starts. */
  week: number;
  weeks: number;
  status: "upcoming" | "active" | "ended";
}

export function seasonNumber(key: string): number {
  const match = /^S\d{4}-(\d+)$/.exec(key);
  return match ? Number(match[1]) : 0;
}

export function describeSeason(key: string, now: Date = new Date()): SeasonInfo {
  const { start, end } = periodRange("season", key);
  const status = now < start ? "upcoming" : now > end ? "ended" : "active";
  const week = status === "active" ? Math.floor((now.getTime() - start.getTime()) / WEEK_MS) + 1 : status === "ended" ? SEASON_WEEKS : 0;
  return { key, number: seasonNumber(key), start: start.toISOString(), end: end.toISOString(), week, weeks: SEASON_WEEKS, status };
}

/** The running season, or the first one while the league has not started yet. */
export function currentSeason(now: Date = new Date()): SeasonInfo {
  const key = periodKey("season", now);
  return describeSeason(key === "S0" ? nextPeriodKey("season", key) : key, now);
}

/** Seasons a member may enroll in: the running one and the next one. */
export function enrollableSeasonKeys(now: Date = new Date()): string[] {
  const current = currentSeason(now);
  return [current.key, nextPeriodKey("season", current.key)];
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export const enrollmentInputSchema = z.object({
  seasonKey: z.string().regex(/^S\d{4}-\d+$/).optional(),
  track: z.enum(SEASON_TRACKS).default("open"),
  goal: z.string().trim().max(SEASON_GOAL_MAX).optional().nullable(),
});
export type EnrollmentInput = z.input<typeof enrollmentInputSchema>;

/** Joins (or updates the track and goal of) a season. Re-enrolling keeps the original join time. */
export async function enrollInSeason(db: AppDb, userId: string, input: EnrollmentInput, now: Date = new Date()): Promise<SeasonEnrollment> {
  const parsed = enrollmentInputSchema.parse(input);
  const seasonKey = parsed.seasonKey ?? currentSeason(now).key;
  if (!enrollableSeasonKeys(now).includes(seasonKey)) {
    throw new BuilderApiError(400, "season_not_open", "You can join the current season or the next one.");
  }
  const goal = parsed.goal ? parsed.goal : null;
  const [row] = await db
    .insert(seasonEnrollments)
    .values({ userId, seasonKey, track: parsed.track, goal, joinedAt: now })
    .onConflictDoUpdate({ target: [seasonEnrollments.userId, seasonEnrollments.seasonKey], set: { track: parsed.track, goal } })
    .returning();
  return row;
}

export async function getEnrollment(db: AppDb, userId: string, seasonKey: string): Promise<SeasonEnrollment | null> {
  const [row] = await db
    .select()
    .from(seasonEnrollments)
    .where(and(eq(seasonEnrollments.userId, userId), eq(seasonEnrollments.seasonKey, seasonKey)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Weekly check-in
// ---------------------------------------------------------------------------

export interface WeeklyCheckIn {
  week: number;
  weekKey: string;
  start: string;
  end: string;
  verified: Record<Stage, number>;
  inReview: number;
  /** Quiet weeks are labelled, not penalised. */
  quiet: boolean;
  current: boolean;
}

/** Verified progress per elapsed week of the season, plus evidence still in review. */
export async function getWeeklyCheckIns(db: AppDb, userId: string, seasonKey: string, now: Date = new Date()): Promise<WeeklyCheckIn[]> {
  const { start, end } = periodRange("season", seasonKey);
  if (now < start) return [];
  const [history, pending] = await Promise.all([
    getVerifiedHistory(db, userId),
    db
      .select({ occurredAt: activityEvidence.occurredAt })
      .from(activityEvidence)
      .where(
        and(
          eq(activityEvidence.userId, userId),
          inArray(activityEvidence.status, ["submitted", "needs_info"]),
          gte(activityEvidence.occurredAt, start),
          lte(activityEvidence.occurredAt, end)
        )
      ),
  ]);
  const lastWeek = now > end ? SEASON_WEEKS : Math.floor((now.getTime() - start.getTime()) / WEEK_MS) + 1;
  const weeks: WeeklyCheckIn[] = [];
  for (let week = 1; week <= lastWeek; week++) {
    const weekStart = new Date(start.getTime() + (week - 1) * WEEK_MS);
    const weekEnd = new Date(weekStart.getTime() + WEEK_MS - 1);
    const inWeek = (at: Date) => at >= weekStart && at <= weekEnd;
    const verified = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
    for (const event of history) if (inWeek(event.occurredAt)) verified[event.stage] += 1;
    const inReview = pending.filter((row) => inWeek(row.occurredAt)).length;
    weeks.push({
      week,
      weekKey: periodKey("week", weekStart),
      start: weekStart.toISOString(),
      end: weekEnd.toISOString(),
      verified,
      inReview,
      quiet: STAGES.every((stage) => verified[stage] === 0) && inReview === 0,
      current: now >= weekStart && now <= weekEnd,
    });
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// Archive (final season snapshots)
// ---------------------------------------------------------------------------

export interface SeasonPlacement {
  board: string;
  place: number;
  score: number | null;
  entrants: number;
}

export interface SeasonArchiveEntry {
  seasonKey: string;
  number: number;
  boards: { board: string; revision: number; entrants: number; rulesetVersion: string; finalizedAt: string }[];
  /** The viewer's own placements; other members' rows are not exposed here. */
  myPlacements: SeasonPlacement[];
}

interface SnapshotEntryLike {
  userId?: unknown;
  rank?: unknown;
  place?: unknown;
  position?: unknown;
  score?: unknown;
  total?: unknown;
}

/** Reads a member's place out of a snapshot's entries, tolerating the entry shape the snapshot writer chose. */
export function placementIn(entries: unknown[], userId: string): { place: number; score: number | null } | null {
  const index = entries.findIndex((entry) => (entry as SnapshotEntryLike)?.userId === userId);
  if (index < 0) return null;
  const entry = entries[index] as SnapshotEntryLike;
  const explicit = [entry.rank, entry.place, entry.position].find((value) => typeof value === "number");
  const score = [entry.score, entry.total].find((value) => typeof value === "number");
  return { place: typeof explicit === "number" ? explicit : index + 1, score: typeof score === "number" ? score : null };
}

/** Latest final revision per board and season, newest season first. */
async function finalSeasonSnapshots(db: AppDb, seasonKeys?: string[]) {
  const conditions = [eq(leagueSnapshots.periodType, "season"), eq(leagueSnapshots.status, "final")];
  if (seasonKeys) conditions.push(inArray(leagueSnapshots.periodKey, seasonKeys));
  const rows = await db
    .select()
    .from(leagueSnapshots)
    .where(and(...conditions))
    .orderBy(desc(leagueSnapshots.revision));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.periodKey}|${row.board}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

export async function getSeasonArchive(db: AppDb, viewerId: string, { limit = 12 } = {}): Promise<SeasonArchiveEntry[]> {
  const snapshots = await finalSeasonSnapshots(db);
  const bySeason = new Map<string, SeasonArchiveEntry>();
  for (const snapshot of snapshots) {
    const season = bySeason.get(snapshot.periodKey) ?? {
      seasonKey: snapshot.periodKey,
      number: seasonNumber(snapshot.periodKey),
      boards: [],
      myPlacements: [],
    };
    season.boards.push({
      board: snapshot.board,
      revision: snapshot.revision,
      entrants: snapshot.entries.length,
      rulesetVersion: snapshot.rulesetVersion,
      finalizedAt: snapshot.createdAt.toISOString(),
    });
    const mine = placementIn(snapshot.entries, viewerId);
    if (mine) season.myPlacements.push({ board: snapshot.board, ...mine, entrants: snapshot.entries.length });
    bySeason.set(snapshot.periodKey, season);
  }
  return [...bySeason.values()]
    .sort((a, b) => b.number - a.number)
    .slice(0, limit)
    .map((season) => ({
      ...season,
      boards: season.boards.sort((a, b) => a.board.localeCompare(b.board)),
      myPlacements: season.myPlacements.sort((a, b) => a.board.localeCompare(b.board)),
    }));
}

/** The member's place on `board` in the final snapshot of the most recently ended season, if any. */
export async function getLastSeasonPlacement(db: AppDb, userId: string, board: string, now: Date = new Date()): Promise<SeasonPlacement | null> {
  const current = periodKey("season", now);
  if (current === "S0") return null;
  const previous = previousPeriodKey("season", current);
  if (previous === "S0") return null;
  const snapshot = (await finalSeasonSnapshots(db, [previous])).find((row) => row.board === board);
  if (!snapshot) return null;
  const mine = placementIn(snapshot.entries, userId);
  return mine ? { board, ...mine, entrants: snapshot.entries.length } : null;
}

export interface SeasonOverview {
  season: SeasonInfo;
  nextSeasonKey: string;
  enrollment: SeasonEnrollment | null;
  checkIns: WeeklyCheckIn[];
  archive: SeasonArchiveEntry[];
}

export async function getSeasonOverview(db: AppDb, userId: string, now: Date = new Date()): Promise<SeasonOverview> {
  const season = currentSeason(now);
  const [enrollment, checkIns, archive] = await Promise.all([
    getEnrollment(db, userId, season.key),
    getWeeklyCheckIns(db, userId, season.key, now),
    getSeasonArchive(db, userId),
  ]);
  return { season, nextSeasonKey: nextPeriodKey("season", season.key), enrollment, checkIns, archive };
}
