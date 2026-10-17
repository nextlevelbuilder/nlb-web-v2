import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { leagueSnapshots } from "@/lib/db/schema";
import {
  SnapshotNotDueError,
  duePeriodKeys,
  finalizeDuePeriods,
  finalizePeriod,
  getBoardSnapshot,
  getBuilderRankings,
  getSnapshotRevisions,
  isFinalizable,
  recomputeSnapshot,
} from "@/lib/builder-league/snapshots";
import { BuilderApiError } from "@/lib/builder-league/http";
import { periodRange } from "@/lib/builder-league/time-windows";
import { HOUR, addLedger, addUsers, local, optIn } from "./leaderboards-fixtures";

let d1: LocalD1;
let db: LocalD1["db"];

beforeEach(async () => {
  d1 = await createLocalD1();
  db = d1.db;
});

afterEach(async () => {
  await d1.dispose();
});

/** Week 2026-W38 runs Monday 14 → Sunday 20 September (local). */
const WEEK = "2026-W38";
const weekEnd = periodRange("week", WEEK).end.getTime();
const duringWeek = local(2026, 9, 18);
const afterGrace = new Date(weekEnd + 73 * HOUR);

describe("league snapshots", () => {
  it("recomputes provisional snapshots idempotently and refreshes them when the ledger changes", async () => {
    await addLedger(db, "a", { stage: "ship", rp: 30, at: local(2026, 9, 14) });
    const first = await recomputeSnapshot(db, "overall", "week", WEEK, duringWeek);
    const again = await recomputeSnapshot(db, "overall", "week", WEEK, duringWeek);
    // September 2026 is before the v2 effective date, so the period is scored by v1.
    expect(first).toMatchObject({ write: "created", snapshot: { status: "provisional", revision: 1, rulesetVersion: "v1" } });
    expect(again).toMatchObject({ write: "unchanged", snapshot: { id: first.snapshot.id, eventHash: first.snapshot.eventHash } });

    await addLedger(db, "b", { stage: "ship", rp: 60, at: local(2026, 9, 15) });
    const refreshed = await recomputeSnapshot(db, "overall", "week", WEEK, duringWeek);
    expect(refreshed).toMatchObject({ write: "refreshed", snapshot: { id: first.snapshot.id, revision: 1, status: "provisional" } });
    expect(refreshed.snapshot.eventHash).not.toBe(first.snapshot.eventHash);
    expect(refreshed.snapshot.entries.map((entry) => entry.userId)).toEqual(["b", "a"]);
    expect(await getSnapshotRevisions(db, "overall", "week", WEEK)).toHaveLength(1);
  });

  it("finalizes only after the period end plus grace", async () => {
    await addLedger(db, "a", { stage: "ship", rp: 30, at: local(2026, 9, 14) });
    expect(isFinalizable("week", WEEK, "v2", new Date(weekEnd + 71 * HOUR))).toBe(false);
    await expect(finalizePeriod(db, "week", WEEK, new Date(weekEnd + 71 * HOUR))).rejects.toBeInstanceOf(SnapshotNotDueError);

    const results = await finalizePeriod(db, "week", WEEK, afterGrace);
    expect(results).toHaveLength(7);
    expect(results.every((result) => result.snapshot.status === "final")).toBe(true);
    const overall = results.find((result) => result.snapshot.board === "overall")!;
    expect(overall).toMatchObject({ write: "finalized", snapshot: { revision: 1 } });
  });

  it("never modifies a final snapshot; late changes append a superseding revision", async () => {
    await addLedger(db, "a", { stage: "ship", rp: 30, at: local(2026, 9, 14) });
    await recomputeSnapshot(db, "overall", "week", WEEK, duringWeek);
    const [final] = (await finalizePeriod(db, "week", WEEK, afterGrace)).filter((r) => r.snapshot.board === "overall");

    // Replaying the finalizer writes nothing.
    const replay = await recomputeSnapshot(db, "overall", "week", WEEK, new Date(afterGrace.getTime() + HOUR));
    expect(replay).toMatchObject({ write: "unchanged", snapshot: { id: final.snapshot.id } });

    // A late approval of work done in that week.
    await addLedger(db, "late", { stage: "ship", rp: 90, at: local(2026, 9, 16) });
    const later = new Date(afterGrace.getTime() + 24 * HOUR);
    const revisions = await Promise.all([
      recomputeSnapshot(db, "overall", "week", WEEK, later),
      recomputeSnapshot(db, "overall", "week", WEEK, later),
    ]);
    const stored = await getSnapshotRevisions(db, "overall", "week", WEEK);
    expect(stored).toHaveLength(2);
    expect(stored[0]).toEqual(final.snapshot);
    expect(stored[1]).toMatchObject({ revision: 2, status: "final", supersedesId: final.snapshot.id });
    expect(stored[1].entries.map((entry) => entry.userId)).toEqual(["late", "a"]);
    expect(revisions.map((r) => r.snapshot.id)).toEqual([stored[1].id, stored[1].id]);
    expect((await getBoardSnapshot(db, "overall", "week", WEEK, later)).id).toBe(stored[1].id);
  });

  it("finalizes due periods from the cron entry point and is safe to repeat", async () => {
    await addLedger(db, "a", { stage: "ship", rp: 30, at: local(2026, 10, 6) });
    const now = local(2026, 10, 16, 6);
    expect(duePeriodKeys("week", now)).toEqual(["2026-W41", "2026-W40", "2026-W39", "2026-W38"]);

    const first = await finalizeDuePeriods(db, now);
    const finalizedWeeks = first.periods.filter((p) => p.periodType === "week").map((p) => p.periodKey);
    expect(finalizedWeeks).toEqual(["2026-W41", "2026-W40", "2026-W39", "2026-W38"]);
    // The current month and year are still open; September is past its grace.
    expect(first.periods.filter((p) => p.periodType === "month").map((p) => p.periodKey)).toEqual(["2026-09", "2026-08"]);
    expect(first.ranksEvaluated).toBe(1);

    const rowsAfterFirst = (await db.select().from(leagueSnapshots)).length;
    const second = await finalizeDuePeriods(db, now);
    expect(second.periods.every((p) => Object.keys(p.writes).join() === "unchanged")).toBe(true);
    expect(second.ranksEvaluated).toBe(0);
    expect(await db.select().from(leagueSnapshots)).toHaveLength(rowsAfterFirst);
  });

  it("serves rankings with snapshot metadata, opt-in entries and period navigation", async () => {
    await addUsers(db, ["a", "b"]);
    await addLedger(db, "a", { stage: "ship", rp: 30, at: local(2026, 9, 14) });
    await addLedger(db, "b", { stage: "ship", rp: 60, at: local(2026, 9, 14) });
    await optIn(db, "a");

    const result = await getBuilderRankings(db, { board: "overall", period: "week", key: WEEK, viewerId: "b", now: duringWeek });
    expect(result).toMatchObject({
      board: "overall",
      periodKey: WEEK,
      previousKey: "2026-W37",
      nextKey: null,
      snapshot: { status: "provisional", revision: 1 },
      entries: [{ rank: 1, userId: "a" }],
      viewer: { position: 1, outOf: 2, isPublic: false },
    });
    const past = await getBuilderRankings(db, { period: "week", key: "2026-W37", viewerId: null, now: duringWeek });
    expect(past.nextKey).toBe(WEEK);
    await expect(getBuilderRankings(db, { period: "week", key: "2026-W40", viewerId: null, now: duringWeek })).rejects.toBeInstanceOf(BuilderApiError);
  });
});
