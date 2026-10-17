import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { computeBoard, computeBoards, parseBoardQuery, toPublicBoard } from "@/lib/builder-league/leaderboards";
import { BuilderApiError } from "@/lib/builder-league/http";
import { addLedger, addUsers, local, optIn, reverse } from "./leaderboards-fixtures";

let db: LocalD1["db"];
let d1: LocalD1;

beforeEach(async () => {
  d1 = await createLocalD1();
  db = d1.db;
});

afterEach(async () => {
  await d1.dispose();
});

const ids = (entries: { userId: string }[]) => entries.map((entry) => entry.userId);

describe("builder boards", () => {
  it("cuts weeks and months at Asia/Ho_Chi_Minh midnight, not UTC", async () => {
    await addLedger(db, "sun-night", { stage: "ship", rp: 30, at: local(2026, 9, 27, 23, 30) });
    await addLedger(db, "mon-early", { stage: "ship", rp: 30, at: local(2026, 9, 28, 0, 10) });
    await addLedger(db, "sep-last", { stage: "ship", rp: 30, at: local(2026, 9, 30, 23, 59) });
    await addLedger(db, "oct-first", { stage: "ship", rp: 30, at: local(2026, 10, 1, 0, 0) });

    expect(ids((await computeBoard(db, "overall", "week", "2026-W39")).entries)).toEqual(["sun-night"]);
    expect(ids((await computeBoard(db, "overall", "week", "2026-W40")).entries).sort()).toEqual(["mon-early", "oct-first", "sep-last"]);
    expect(ids((await computeBoard(db, "overall", "month", "2026-09")).entries).sort()).toEqual(["mon-early", "sep-last", "sun-night"]);
    expect(ids((await computeBoard(db, "overall", "month", "2026-10")).entries)).toEqual(["oct-first"]);
  });

  it("lets stage specialists top their own stage board while overall uses the weights", async () => {
    // Week 2026-W38: Monday 14 September.
    await addLedger(db, "v", { stage: "validate", rp: 60, at: local(2026, 9, 14, 9) });
    await addLedger(db, "v", { stage: "validate", rp: 60, at: local(2026, 9, 14, 10) });
    await addLedger(db, "s", { stage: "ship", rp: 150, at: local(2026, 9, 14, 11) });
    await addLedger(db, "m", { stage: "validate", rp: 60, at: local(2026, 9, 15, 9) });
    await addLedger(db, "m", { stage: "ship", rp: 150, at: local(2026, 9, 15, 10) });
    await addLedger(db, "b", { stage: "build", rp: 100, at: local(2026, 9, 16, 9) });
    await addLedger(db, "c", { stage: "contribute", rp: 40, at: local(2026, 9, 16, 9) });

    const boards = Object.fromEntries((await computeBoards(db, "week", "2026-W38")).map((board) => [board.board, board]));
    expect(ids(boards.overall.entries)).toEqual(["m", "v", "s", "b", "c"]);
    expect(boards.overall.entries.map((entry) => entry.score)).toEqual([52.5, 35, 35, 20, 10]);
    expect(ids(boards.validate.entries)).toEqual(["v", "m"]);
    // m and s tie on 150 ship RP and one event each; s reached it first.
    expect(ids(boards.ship.entries)).toEqual(["s", "m"]);
    expect(ids(boards.build.entries)).toEqual(["b"]);
    expect(boards.contribute.entries).toMatchObject([{ userId: "c", score: 40, position: 1 }]);
    expect(ids(boards.validate.entries)).not.toContain("c");
  });

  it("ranks contributor-only members on the contribute board", async () => {
    await addLedger(db, "helper", { stage: "contribute", rp: 15, at: local(2026, 9, 8), awardType: "contribute_contributor_work" });
    await addLedger(db, "helper", { stage: "contribute", rp: 8, at: local(2026, 9, 9), awardType: "contribute_peer_help" });
    await addLedger(db, "shipper", { stage: "ship", rp: 10, at: local(2026, 9, 8) });

    const contribute = await computeBoard(db, "contribute", "week", "2026-W37");
    expect(contribute.entries).toMatchObject([{ userId: "helper", position: 1, score: 23, verifiedEventCount: 2 }]);
    const overall = await computeBoard(db, "overall", "week", "2026-W37");
    expect(ids(overall.entries)).toContain("helper");
  });

  it("breaks ties deterministically: verified events, then earlier time, then user id", async () => {
    await addLedger(db, "t1", { stage: "ship", rp: 15, at: local(2026, 9, 9, 9) });
    await addLedger(db, "t1", { stage: "ship", rp: 15, at: local(2026, 9, 10, 9) });
    await addLedger(db, "t2", { stage: "ship", rp: 30, at: local(2026, 9, 9, 9) });
    await addLedger(db, "t3", { stage: "ship", rp: 30, at: local(2026, 9, 8, 9) });
    await addLedger(db, "t5", { stage: "ship", rp: 30, at: local(2026, 9, 11, 9) });
    await addLedger(db, "t4", { stage: "ship", rp: 30, at: local(2026, 9, 11, 9) });

    const first = await computeBoard(db, "overall", "week", "2026-W37");
    const second = await computeBoard(db, "overall", "week", "2026-W37");
    expect(ids(first.entries)).toEqual(["t1", "t3", "t2", "t4", "t5"]);
    expect(first).toEqual(second);
  });

  it("nets reversals out of the period", async () => {
    const original = { stage: "ship" as const, rp: 30, at: local(2026, 8, 18) };
    const entryId = await addLedger(db, "reversed", original);
    await reverse(db, "reversed", entryId, original);
    await addLedger(db, "kept", { stage: "ship", rp: 10, at: local(2026, 8, 18) });

    expect(ids((await computeBoard(db, "overall", "week", "2026-W34")).entries)).toEqual(["kept"]);
    expect(ids((await computeBoard(db, "ship", "week", "2026-W34")).entries)).toEqual(["kept"]);
  });

  it("ranks Rising builders by improvement over their own previous period with an activity floor", async () => {
    await addLedger(db, "r1", { stage: "ship", rp: 30, at: local(2026, 7, 10) });
    await addLedger(db, "r1", { stage: "ship", rp: 60, at: local(2026, 8, 5) });
    await addLedger(db, "r1", { stage: "ship", rp: 60, at: local(2026, 8, 6) });
    // Declined: excluded.
    await addLedger(db, "r2", { stage: "ship", rp: 120, at: local(2026, 7, 10) });
    await addLedger(db, "r2", { stage: "ship", rp: 30, at: local(2026, 8, 5) });
    await addLedger(db, "r2", { stage: "ship", rp: 30, at: local(2026, 8, 6) });
    // No history before the period: a newcomer, not a riser.
    await addLedger(db, "r3", { stage: "ship", rp: 60, at: local(2026, 8, 5) });
    await addLedger(db, "r3", { stage: "ship", rp: 60, at: local(2026, 8, 6) });
    // Below the activity floor (one event).
    await addLedger(db, "r4", { stage: "ship", rp: 10, at: local(2026, 7, 10) });
    await addLedger(db, "r4", { stage: "ship", rp: 200, at: local(2026, 8, 5) });
    // Quiet previous month, history before it: rises from zero.
    await addLedger(db, "r5", { stage: "ship", rp: 30, at: local(2026, 6, 15) });
    await addLedger(db, "r5", { stage: "ship", rp: 30, at: local(2026, 8, 5) });
    await addLedger(db, "r5", { stage: "ship", rp: 30, at: local(2026, 8, 6) });

    const rising = await computeBoard(db, "rising", "month", "2026-08");
    expect(rising.entries).toMatchObject([
      { userId: "r1", score: 5.25, previousScore: 1.75 },
      { userId: "r5", score: 3.5, previousScore: 0 },
    ]);
  });

  it("lists newcomers whose first ledger entry is within 90 days of the period start", async () => {
    await addLedger(db, "fresh", { stage: "ship", rp: 30, at: local(2026, 8, 5) });
    await addLedger(db, "recent", { stage: "ship", rp: 10, at: local(2026, 5, 10) });
    await addLedger(db, "recent", { stage: "ship", rp: 20, at: local(2026, 8, 5) });
    await addLedger(db, "veteran", { stage: "ship", rp: 10, at: local(2026, 3, 1) });
    await addLedger(db, "veteran", { stage: "ship", rp: 90, at: local(2026, 8, 5) });

    const newcomers = await computeBoard(db, "newcomers", "month", "2026-08");
    expect(ids(newcomers.entries)).toEqual(["fresh", "recent"]);
    expect(newcomers.entries.map((entry) => entry.position)).toEqual([1, 2]);
  });

  it("lists only opted-in members and shows the viewer their own position privately", async () => {
    await addUsers(db, ["p1", "p2", "p3"]);
    await addLedger(db, "p1", { stage: "ship", rp: 90, at: local(2026, 9, 1) });
    await addLedger(db, "p2", { stage: "ship", rp: 60, at: local(2026, 9, 1) });
    await addLedger(db, "p3", { stage: "ship", rp: 30, at: local(2026, 9, 1) });
    await optIn(db, "p2");
    await optIn(db, "p3", { leaderboardPublic: false, passportPublic: true });

    const board = await computeBoard(db, "overall", "week", "2026-W36");
    const asP1 = await toPublicBoard(db, board.entries, "p1");
    expect(asP1.entries).toMatchObject([{ rank: 1, userId: "p2", name: "Name p2" }]);
    expect(asP1.viewer).toMatchObject({ position: 1, outOf: 3, isPublic: false });
    expect((await toPublicBoard(db, board.entries, "p3")).viewer).toMatchObject({ position: 3, isPublic: false });
    expect((await toPublicBoard(db, board.entries, "p2")).viewer).toMatchObject({ position: 2, isPublic: true });
    expect((await toPublicBoard(db, board.entries, null)).viewer).toBeNull();

    await optIn(db, "p2", { leaderboardPublic: false });
    expect((await toPublicBoard(db, board.entries, null)).entries).toEqual([]);
  });

  it("validates board queries and refuses future periods", () => {
    const now = local(2026, 10, 16);
    expect(parseBoardQuery({}, now)).toEqual({ board: "overall", periodType: "week", periodKey: "2026-W42" });
    expect(parseBoardQuery({ board: "ship", period: "month", key: "2026-09" }, now)).toEqual({ board: "ship", periodType: "month", periodKey: "2026-09" });
    for (const query of [{ board: "tier" }, { period: "day" }, { period: "week", key: "2026-W60" }, { period: "month", key: "2026-12" }]) {
      expect(() => parseBoardQuery(query, now)).toThrow(BuilderApiError);
    }
  });
});
