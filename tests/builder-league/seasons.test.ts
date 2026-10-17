import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { leagueSnapshots } from "@/lib/db/schema";
import {
  currentSeason,
  describeSeason,
  enrollInSeason,
  enrollableSeasonKeys,
  getLastSeasonPlacement,
  getSeasonArchive,
  getWeeklyCheckIns,
  placementIn,
} from "@/lib/builder-league/seasons";
import { at, seedMembers, verified, SEASON_ONE_START } from "./progression-fixtures";

describe("season boundaries", () => {
  it("counts 8-week seasons from the epoch in Vietnam time", () => {
    expect(currentSeason(new Date("2026-10-17T05:00:00Z"))).toMatchObject({ key: "S2026-1", status: "upcoming", week: 0 });
    // Sunday 18 Oct 23:59 local is still before the league; Monday 00:00 local starts week 1.
    expect(currentSeason(new Date("2026-10-18T16:59:59Z")).status).toBe("upcoming");
    expect(currentSeason(SEASON_ONE_START)).toMatchObject({ key: "S2026-1", status: "active", week: 1, weeks: 8 });
    expect(currentSeason(new Date(SEASON_ONE_START.getTime() + 56 * 86_400_000 - 1))).toMatchObject({ key: "S2026-1", week: 8 });
    expect(currentSeason(new Date(SEASON_ONE_START.getTime() + 56 * 86_400_000))).toMatchObject({ key: "S2026-2", week: 1 });
    expect(describeSeason("S2026-1", new Date("2027-01-01T00:00:00Z")).status).toBe("ended");
    // Season 3 starts in February 2027, so its key carries 2027.
    expect(currentSeason(new Date("2027-02-08T00:00:00Z")).key).toBe("S2027-3");
  });

  it("lets members join only the current or the next season", () => {
    expect(enrollableSeasonKeys(new Date("2026-11-01T00:00:00Z"))).toEqual(["S2026-1", "S2026-2"]);
  });

  it("reads a placement from snapshot entries of any reasonable shape", () => {
    expect(placementIn([{ userId: "a" }, { userId: "b", score: 3 }], "b")).toEqual({ place: 2, score: 3 });
    expect(placementIn([{ userId: "a", rank: 7, total: 1 }], "a")).toEqual({ place: 7, score: 1 });
    expect(placementIn([{ userId: "a" }], "z")).toBeNull();
  });
});

describe("seasons on local D1", () => {
  let local: LocalD1;
  const NOW = new Date("2026-11-04T03:00:00Z"); // Wednesday of week 3 of S2026-1

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterAll(() => vi.useRealTimers());
  beforeEach(async () => {
    local = await createLocalD1();
    await seedMembers(local.db);
  });
  afterEach(async () => local.dispose());

  it("enrolls with an optional track and goal, and updates without duplicating", async () => {
    const first = await enrollInSeason(local.db, "u1", { track: "validate", goal: "Talk to 10 customers" }, NOW);
    expect(first).toMatchObject({ seasonKey: "S2026-1", track: "validate", goal: "Talk to 10 customers" });
    const again = await enrollInSeason(local.db, "u1", { track: "build" }, NOW);
    expect(again).toMatchObject({ track: "build", goal: null });
    expect(again.joinedAt.getTime()).toBe(first.joinedAt.getTime());
    await expect(enrollInSeason(local.db, "u1", { seasonKey: "S2027-3" }, NOW)).rejects.toMatchObject({ code: "season_not_open" });
    await expect(enrollInSeason(local.db, "u1", { goal: "x".repeat(281) }, NOW)).rejects.toThrow();
  });

  it("summarises each elapsed week softly: quiet weeks are labelled, never penalised", async () => {
    await verified(local.db, "u1", "validate_problem_signal", at(1));
    await verified(local.db, "u1", "contribute_peer_help", at(15), { verification: "peer_confirmed", payload: { counterpartyUserId: "u2" } });
    const weeks = await getWeeklyCheckIns(local.db, "u1", "S2026-1", NOW);
    expect(weeks).toHaveLength(3);
    expect(weeks[0]).toMatchObject({ week: 1, weekKey: "2026-W43", quiet: false, verified: { validate: 1 } });
    expect(weeks[1]).toMatchObject({ week: 2, quiet: true });
    expect(weeks[2]).toMatchObject({ week: 3, current: true, verified: { contribute: 1 } });
    expect(JSON.stringify(weeks)).not.toMatch(/streak|penalt/i);
  });

  it("archives results from the latest final season snapshot only", async () => {
    vi.setSystemTime(new Date("2027-01-05T03:00:00Z"));
    const base = { periodType: "season" as const, periodKey: "S2026-1", rulesetVersion: "v2", watermarkAt: new Date(), eventHash: "h" };
    await local.db.insert(leagueSnapshots).values([
      { ...base, board: "overall", revision: 1, status: "final", entries: [{ userId: "u1" }, { userId: "u2" }] },
      { ...base, board: "overall", revision: 2, status: "final", entries: [{ userId: "u2" }, { userId: "u1" }, { userId: "u3" }] },
      { ...base, board: "ship", revision: 1, status: "provisional", entries: [{ userId: "u1" }] },
    ]);
    const archive = await getSeasonArchive(local.db, "u1");
    expect(archive).toHaveLength(1);
    expect(archive[0].boards).toEqual([expect.objectContaining({ board: "overall", revision: 2, entrants: 3 })]);
    expect(archive[0].myPlacements).toEqual([{ board: "overall", place: 2, score: null, entrants: 3 }]);
    expect(JSON.stringify(archive)).not.toContain("u3");
    expect(await getLastSeasonPlacement(local.db, "u2", "overall", new Date("2027-01-05T03:00:00Z"))).toMatchObject({ place: 1 });
    expect(await getLastSeasonPlacement(local.db, "u2", "ship", new Date("2027-01-05T03:00:00Z"))).toBeNull();
    vi.setSystemTime(NOW);
  });
});
