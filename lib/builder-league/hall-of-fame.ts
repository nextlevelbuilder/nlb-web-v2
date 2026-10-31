/**
 * Annual Hall of Fame: the official, frozen results of one Builder League year, read from the final
 * yearly league snapshots (`league_snapshots`, period type `year`, key `YYYY`).
 *
 * Rules:
 * - Only `status = 'final'` snapshots are read, and only when every board of the year is final. A year
 *   with any provisional or missing board is reported as `not_final`; provisional standings are never
 *   presented as official. Reading never computes or writes a snapshot (the year-end cron finalizes).
 * - The highest final revision of each board wins, so late corrections (superseding revisions) apply.
 * - Members are listed only with the current `leaderboard_public` opt-in, checked on every read through
 *   `toPublicBoard`, so revoked consent disappears immediately even from a frozen year. Ranks are
 *   renumbered among listed members, exactly like the public boards.
 * - Fields are a subset of what the public boards already expose (name, avatar, score, verified event
 *   count, and the previous score on Rising). Stage components are not repeated here.
 */
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { leagueSnapshots } from "@/lib/db/schema";
import { BOARD_KEYS, type BoardKey } from "./types";
import { getPublicPassportUserIds, toPublicBoard, type BoardEntry } from "./leaderboards";
import { graceFor } from "./snapshots";
import { localYear, periodRange } from "./time-windows";
import { isBuilderLeagueEnabled } from "./access";
import { publicWrappedPaths } from "./public-surfaces";

/**
 * Members listed per board. The overall board is the headline annual ranking, so it keeps a top ten;
 * stage, Rising and Newcomers boards honour a podium of three, which keeps the page scannable and
 * names as few members as the recognition needs.
 */
export const HALL_OF_FAME_LIMITS: Record<BoardKey, number> = {
  overall: 10,
  validate: 3,
  build: 3,
  ship: 3,
  contribute: 3,
  rising: 3,
  newcomers: 3,
};

export interface HallOfFameEntry {
  /** Position among listed (opted-in) members, 1-based without gaps. */
  rank: number;
  userId: string;
  name: string;
  image: string | null;
  score: number;
  verifiedEventCount: number;
  /** Rising only: the member's score in the previous year. */
  previousScore?: number;
  /** The member's passport is public, so the page may link to it. */
  passportPublic: boolean;
}

export interface HallOfFameBoard {
  board: BoardKey;
  revision: number;
  rulesetVersion: string;
  eventHash: string;
  /** When this final revision was written. */
  finalizedAt: Date;
  entries: HallOfFameEntry[];
}

export type HallOfFame =
  | { year: number; status: "final"; finalizedAt: Date; boards: HallOfFameBoard[] }
  | {
      year: number;
      status: "not_final";
      /** `open`: the year has not ended; `pending`: it ended and its boards are not all final yet. */
      reason: "open" | "pending";
      /** Earliest moment the year can be finalized (year end plus the ruleset's grace). */
      finalAfter: Date;
    };

type SnapshotRow = Pick<typeof leagueSnapshots.$inferSelect, "board" | "revision" | "status" | "rulesetVersion" | "eventHash" | "watermarkAt" | "entries">;

/** Highest revision per board; exported for tests. */
export function latestPerBoard(rows: readonly SnapshotRow[]): Map<string, SnapshotRow> {
  const latest = new Map<string, SnapshotRow>();
  for (const row of rows) {
    const current = latest.get(row.board);
    if (!current || row.revision > current.revision) latest.set(row.board, row);
  }
  return latest;
}

/** The Hall of Fame of `year`, or its not-final state. Read-only. */
export async function getHallOfFame(db: AppDb, year: number, now: Date = new Date()): Promise<HallOfFame> {
  const key = String(year);
  const range = periodRange("year", key);
  const rows = await db
    .select({
      board: leagueSnapshots.board,
      revision: leagueSnapshots.revision,
      status: leagueSnapshots.status,
      rulesetVersion: leagueSnapshots.rulesetVersion,
      eventHash: leagueSnapshots.eventHash,
      watermarkAt: leagueSnapshots.watermarkAt,
      entries: leagueSnapshots.entries,
    })
    .from(leagueSnapshots)
    .where(and(eq(leagueSnapshots.periodType, "year"), eq(leagueSnapshots.periodKey, key)));
  const latest = latestPerBoard(rows);
  const overall = latest.get("overall");
  const finalAfter = new Date(range.end.getTime() + graceFor(overall?.rulesetVersion ?? ""));

  const yearEnded = now.getTime() > range.end.getTime();
  const allFinal = BOARD_KEYS.every((board) => latest.get(board)?.status === "final");
  if (!yearEnded || !allFinal) return { year, status: "not_final", reason: yearEnded ? "pending" : "open", finalAfter };

  const views = await Promise.all(
    BOARD_KEYS.map(async (board) => {
      const row = latest.get(board)!;
      const view = await toPublicBoard(db, row.entries as BoardEntry[], null, HALL_OF_FAME_LIMITS[board]);
      return { row, board, entries: view.entries };
    })
  );
  const passports = await getPublicPassportUserIds(db, [...new Set(views.flatMap((view) => view.entries.map((entry) => entry.userId)))]);
  const boards: HallOfFameBoard[] = views.map(({ row, board, entries }) => ({
    board,
    revision: row.revision,
    rulesetVersion: row.rulesetVersion,
    eventHash: row.eventHash,
    finalizedAt: row.watermarkAt,
    entries: entries.map((entry) => ({
      rank: entry.rank,
      userId: entry.userId,
      name: entry.name,
      image: entry.image,
      score: entry.score,
      verifiedEventCount: entry.verifiedEventCount,
      ...(board === "rising" && entry.previousScore !== undefined ? { previousScore: entry.previousScore } : {}),
      passportPublic: passports.has(entry.userId),
    })),
  }));
  const finalizedAt = new Date(Math.max(...boards.map((board) => board.finalizedAt.getTime())));
  return { year, status: "final", finalizedAt, boards };
}

/** Unlocalized Hall of Fame path of a year. */
export const hallOfFamePath = (year: number) => `/wrapped/${year}/hall-of-fame`;

/**
 * Hall of Fame pages discovery surfaces advertise (sitemap, llms.txt): completed years only, while the
 * league is public. The current year cannot have official results, so it is not advertised.
 */
export function publicHallOfFamePaths(now: Date = new Date(), enabled: boolean = isBuilderLeagueEnabled()): string[] {
  const current = localYear(now);
  return publicWrappedPaths(now, enabled)
    .map((path) => Number(path.slice("/wrapped/".length)))
    .filter((year) => year < current)
    .map(hallOfFamePath);
}

/**
 * True for an unlocalized Hall of Fame path the site serves publicly (any year whose Community Wrapped
 * is public, including the current one, which renders its not-final state).
 */
export function isPublicHallOfFamePath(path: string, now: Date = new Date(), enabled: boolean = isBuilderLeagueEnabled()): boolean {
  const match = /^\/wrapped\/(\d{4})\/hall-of-fame$/.exec(path);
  return Boolean(match) && publicWrappedPaths(now, enabled).includes(`/wrapped/${match![1]}`);
}
