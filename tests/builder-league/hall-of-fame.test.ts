import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { builderPrivacy, leagueSnapshots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import robots from "@/app/robots";
import { pagePath } from "@/lib/markdown/page-paths";
import { finalizePeriod, recomputePeriod } from "@/lib/builder-league/snapshots";
import {
  HALL_OF_FAME_LIMITS,
  getHallOfFame,
  isPublicHallOfFamePath,
  publicHallOfFamePaths,
  type HallOfFame,
} from "@/lib/builder-league/hall-of-fame";
import type { BoardEntry } from "@/lib/builder-league/leaderboards";
import { BOARD_KEYS, STAGES, type BoardKey, type Stage } from "@/lib/builder-league/types";
import { hallOfFameJsonLd } from "@/lib/structured-data";
import { addLedger, addUsers, local, optIn } from "./leaderboards-fixtures";

let d1: LocalD1;
let db: LocalD1["db"];

beforeEach(async () => {
  d1 = await createLocalD1();
  db = d1.db;
});

afterEach(async () => {
  await d1.dispose();
});

const DURING_YEAR = local(2026, 10, 28);
const IN_GRACE = local(2027, 1, 2);
const AFTER_GRACE = local(2027, 1, 8);

function assertFinal(hall: HallOfFame): asserts hall is Extract<HallOfFame, { status: "final" }> {
  expect(hall.status).toBe("final");
}

const board = (hall: Extract<HallOfFame, { status: "final" }>, key: BoardKey) => hall.boards.find((b) => b.board === key)!;

/** Five builders with distinct 2026 scores; a > b > c > d > e on the overall board. */
async function seedYear() {
  await addUsers(db, ["a", "b", "c", "d", "e"]);
  const points: Record<string, number> = { a: 50, b: 40, c: 30, d: 20, e: 10 };
  for (const [userId, rp] of Object.entries(points)) {
    await addLedger(db, userId, { stage: "ship", rp, at: local(2026, 3, 2) });
    await addLedger(db, userId, { stage: "validate", rp: rp / 2, at: local(2026, 4, 6) });
  }
  await optIn(db, "a", { leaderboardPublic: true, passportPublic: true });
  await optIn(db, "b", { leaderboardPublic: true });
  // c never opts in (no privacy row: private by default).
  await optIn(db, "d", { leaderboardPublic: true, passportPublic: true });
  await optIn(db, "e", { leaderboardPublic: false, passportPublic: true });
}

const zero = (): Record<Stage, number> => Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
const entry = (userId: string, position: number, score: number): BoardEntry => ({ userId, position, score, components: { ...zero(), ship: score }, verifiedEventCount: 1, reachedAt: 0 });

/** Inserts one stored snapshot row directly, for states the cron path does not produce on its own. */
async function insertSnapshot(boardKey: BoardKey, values: { revision?: number; status: "provisional" | "final"; entries?: BoardEntry[]; eventHash?: string }) {
  await db.insert(leagueSnapshots).values({
    board: boardKey,
    periodType: "year",
    periodKey: "2026",
    revision: values.revision ?? 1,
    status: values.status,
    rulesetVersion: "v2",
    watermarkAt: AFTER_GRACE,
    eventHash: values.eventHash ?? `hash-${boardKey}-${values.revision ?? 1}`,
    entries: values.entries ?? [],
  });
}

describe("annual Hall of Fame", () => {
  it("reports an open year as not final and never shows its provisional boards", async () => {
    await seedYear();
    await recomputePeriod(db, "year", "2026", DURING_YEAR);
    const hall = await getHallOfFame(db, 2026, DURING_YEAR);
    expect(hall).toMatchObject({ year: 2026, status: "not_final", reason: "open" });
    expect(hall).not.toHaveProperty("boards");
    if (hall.status === "not_final") expect(hall.finalAfter.getTime()).toBeGreaterThan(local(2026, 12, 31, 23, 59).getTime());
  });

  it("stays not final after the year ends while its boards are still provisional (grace period)", async () => {
    await seedYear();
    const results = await recomputePeriod(db, "year", "2026", IN_GRACE);
    expect(results.every((result) => result.snapshot.status === "provisional")).toBe(true);
    expect(await getHallOfFame(db, 2026, IN_GRACE)).toMatchObject({ status: "not_final", reason: "pending" });
  });

  it("is not final when no snapshot exists, and reading it writes nothing", async () => {
    expect(await getHallOfFame(db, 2026, AFTER_GRACE)).toMatchObject({ status: "not_final", reason: "pending" });
    expect(await db.select().from(leagueSnapshots)).toHaveLength(0);
  });

  it("is not final while any board of the year is still provisional", async () => {
    for (const key of BOARD_KEYS) await insertSnapshot(key, { status: key === "newcomers" ? "provisional" : "final" });
    expect(await getHallOfFame(db, 2026, AFTER_GRACE)).toMatchObject({ status: "not_final", reason: "pending" });
  });

  it("lists only opted-in members of the final boards, renumbered, with passport links only when public", async () => {
    await seedYear();
    await finalizePeriod(db, "year", "2026", AFTER_GRACE);
    const hall = await getHallOfFame(db, 2026, AFTER_GRACE);
    assertFinal(hall);
    expect(hall.boards.map((b) => b.board)).toEqual([...BOARD_KEYS]);
    const overall = board(hall, "overall");
    // c (no opt-in) and e (opted out of boards, even with a public passport) are left out.
    expect(overall.entries.map((e) => [e.rank, e.userId, e.passportPublic])).toEqual([
      [1, "a", true],
      [2, "b", false],
      [3, "d", true],
    ]);
    expect(overall.revision).toBe(1);
    // Only fields the public boards already expose; no stage components or raw positions.
    expect(Object.keys(overall.entries[0]).sort()).toEqual(["image", "name", "passportPublic", "rank", "score", "userId", "verifiedEventCount"]);
    expect(board(hall, "ship").entries.map((e) => e.userId)).toEqual(["a", "b", "d"]);
    expect(board(hall, "build").entries).toEqual([]);
  });

  it("drops a member whose leaderboard consent is revoked after the year was frozen", async () => {
    await seedYear();
    await finalizePeriod(db, "year", "2026", AFTER_GRACE);
    await db.update(builderPrivacy).set({ leaderboardPublic: false }).where(eq(builderPrivacy.userId, "a"));
    const hall = await getHallOfFame(db, 2026, AFTER_GRACE);
    assertFinal(hall);
    expect(board(hall, "overall").entries.map((e) => [e.rank, e.userId])).toEqual([
      [1, "b"],
      [2, "d"],
    ]);
    // The frozen snapshot itself is untouched.
    const [stored] = await db.select().from(leagueSnapshots).where(eq(leagueSnapshots.board, "overall"));
    expect((stored.entries as BoardEntry[]).map((e) => e.userId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("orders deterministically by the stored final positions and caps each board", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `m${String(i).padStart(2, "0")}`);
    await addUsers(db, ids);
    for (const id of ids) await optIn(db, id);
    // Tied scores: the stored positions (already tie-broken at finalization) decide the order.
    const ranked = [...ids].reverse().map((id, index) => entry(id, index + 1, 100));
    for (const key of BOARD_KEYS) await insertSnapshot(key, { status: "final", entries: ranked });
    const first = await getHallOfFame(db, 2026, AFTER_GRACE);
    const second = await getHallOfFame(db, 2026, AFTER_GRACE);
    assertFinal(first);
    expect(second).toEqual(first);
    expect(board(first, "overall").entries.map((e) => e.userId)).toEqual([...ids].reverse().slice(0, HALL_OF_FAME_LIMITS.overall));
    expect(board(first, "validate").entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(HALL_OF_FAME_LIMITS.overall).toBe(10);
  });

  it("reads the highest final revision when a late correction superseded the first", async () => {
    await addUsers(db, ["x", "y"]);
    await optIn(db, "x");
    await optIn(db, "y");
    for (const key of BOARD_KEYS) await insertSnapshot(key, { status: "final", entries: [entry("x", 1, 30), entry("y", 2, 20)] });
    await insertSnapshot("overall", { revision: 2, status: "final", entries: [entry("y", 1, 40), entry("x", 2, 30)] });
    const hall = await getHallOfFame(db, 2026, AFTER_GRACE);
    assertFinal(hall);
    expect(board(hall, "overall")).toMatchObject({ revision: 2, eventHash: "hash-overall-2" });
    expect(board(hall, "overall").entries.map((e) => e.userId)).toEqual(["y", "x"]);
  });

  it("describes the final overall board as an ItemList of listed members", () => {
    const jsonLd = hallOfFameJsonLd({
      year: 2026,
      locale: "vi",
      name: "Hall of Fame 2026",
      description: "Final results.",
      members: [{ name: "A", passportPath: "/builders/a" }, { name: "B", passportPath: null }],
      modifiedAt: new Date("2027-01-05T00:00:00Z"),
    });
    expect(jsonLd).toMatchObject({ "@type": "ItemList", numberOfItems: 2, inLanguage: "vi" });
    expect(String(jsonLd.url)).toMatch(/\/vi\/wrapped\/2026\/hall-of-fame$/);
    const items = jsonLd.itemListElement as { position: number; item: Record<string, unknown> }[];
    expect(items[0]).toMatchObject({ position: 1, item: { "@type": "Person", name: "A" } });
    expect(String(items[0].item.url)).toMatch(/\/vi\/builders\/a$/);
    expect(items[1].item).not.toHaveProperty("url");
  });
});

describe("Hall of Fame discovery", () => {
  const NOW = new Date("2027-03-01T05:00:00Z");

  it("advertises completed years only, and only while the flag is on", () => {
    expect(publicHallOfFamePaths(NOW, false)).toEqual([]);
    expect(publicHallOfFamePaths(NOW, true)).toEqual(["/wrapped/2026/hall-of-fame"]);
    expect(publicHallOfFamePaths(DURING_YEAR, true)).toEqual([]);
  });

  it("serves a markdown twin for every public year, including the not-final current one", () => {
    expect(isPublicHallOfFamePath("/wrapped/2027/hall-of-fame", NOW, true)).toBe(true);
    expect(isPublicHallOfFamePath("/wrapped/2026/hall-of-fame", NOW, false)).toBe(false);
    expect(isPublicHallOfFamePath("/wrapped/2025/hall-of-fame", NOW, true)).toBe(false);
    expect(isPublicHallOfFamePath("/wrapped/2026/token", NOW, true)).toBe(false);
  });

  it("maps the markdown twin path only while the league is public", () => {
    try {
      vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
      expect(pagePath("/vi/wrapped/2026/hall-of-fame")).toMatchObject({ path: "/wrapped/2026/hall-of-fame", locale: "vi" });
      vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
      expect(pagePath("/wrapped/2026/hall-of-fame")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/** RFC 9309 matching as Google applies it: longest matching rule wins, `allow` wins a tie. */
function isAllowed(path: string): boolean {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const toList = (value: string | string[] | undefined) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
  const matches = (pattern: string) => {
    const anchored = pattern.endsWith("$");
    const body = (anchored ? pattern.slice(0, -1) : pattern).split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
  };
  const longest = (patterns: string[]) => Math.max(-1, ...patterns.filter(matches).map((pattern) => pattern.length));
  return longest(toList(rule.allow)) >= longest(toList(rule.disallow));
}

describe("robots rules for Wrapped", () => {
  it("blocks personal share-token pages in every locale", () => {
    for (const prefix of ["", "/vi", "/en"]) {
      expect(isAllowed(`${prefix}/wrapped/2026/AbC123token`)).toBe(false);
      expect(isAllowed(`${prefix}/wrapped/2026/hall-of-fame-token`)).toBe(false);
    }
  });

  it("keeps Community Wrapped and the Hall of Fame (and their twins) crawlable in every locale", () => {
    for (const prefix of ["", "/vi", "/en"]) {
      expect(isAllowed(`${prefix}/wrapped/2026`)).toBe(true);
      expect(isAllowed(`${prefix}/wrapped/2026.md`)).toBe(true);
      expect(isAllowed(`${prefix}/wrapped/2026/hall-of-fame`)).toBe(true);
      expect(isAllowed(`${prefix}/wrapped/2026/hall-of-fame.md`)).toBe(true);
    }
    expect(isAllowed("/builder-league/leaderboards")).toBe(false);
  });
});
