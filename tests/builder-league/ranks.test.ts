import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/polar", () => ({
  MEMBERSHIP_PLAN_PRODUCT_IDS: { premium: ["prod_premium"], vip: ["prod_vip"] },
  EARLYBIRD_MEMBERSHIP_PRODUCT_IDS: { premium: undefined, vip: undefined },
}));

import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { builderEvents, customers, mentorNominations, rankAwards, subscriptions } from "@/lib/db/schema";
import { evaluateRank, getCurrentRank, recordNomination } from "@/lib/builder-league/ranks";
import { computeBoard } from "@/lib/builder-league/leaderboards";
import { getCommunityTier } from "@/lib/builder-league/membership";
import { DAY, addEvent, addLedger, addUsers, local, reverse, type LedgerFixture } from "./leaderboards-fixtures";

let d1: LocalD1;
let db: LocalD1["db"];

beforeEach(async () => {
  d1 = await createLocalD1();
  db = d1.db;
});

afterEach(async () => {
  await d1.dispose();
});

/** A fixed past instant (the ledger refuses events in the future). Ruleset v1 is in force. */
const NOW = local(2026, 10, 16, 6);
const ago = (days: number, from = NOW) => new Date(from.getTime() - days * DAY);

/** Meets the Builder gate: 60 days' tenure, 8 ships, 120 RP, weekly feedback in 8 of 9 weeks. */
async function seedBuilder(userId: string): Promise<LedgerFixture[]> {
  await addUsers(db, [userId], { createdAt: ago(60) });
  const ships: LedgerFixture[] = [];
  for (let i = 0; i < 8; i++) {
    const ship = { stage: "ship" as const, rp: 10, at: ago(i * 7 + 2), awardType: "ship_public_post", id: `${userId}-ship-${i}` };
    await addLedger(db, userId, ship);
    ships.push(ship);
    await addLedger(db, userId, { stage: "contribute", rp: 5, at: ago(i * 7 + 1), awardType: "contribute_weekly_feedback" });
  }
  return ships;
}

describe("rank gate", () => {
  it("does not award a rank for RP alone", async () => {
    await addUsers(db, ["rich"], { createdAt: ago(400) });
    await addLedger(db, "rich", { stage: "ship", rp: 2500, at: ago(10), awardType: "adjustment" });

    const result = await evaluateRank(db, "rich", { now: NOW });
    expect(result.stats.rp).toBe(2500);
    expect(result.stats.shipCount).toBe(0);
    expect(result).toMatchObject({ currentRank: "apprentice", awarded: null });
    expect(result.checklist.checks.find((c) => c.rank === "builder")?.requirements.find((r) => r.key === "rp")?.met).toBe(true);
    expect(await db.select().from(rankAwards)).toHaveLength(0);
  });

  it("awards a rank once when every gate passes, with a rank event", async () => {
    await seedBuilder("bld");
    const results = await Promise.all([evaluateRank(db, "bld", { now: NOW }), evaluateRank(db, "bld", { now: NOW })]);
    expect(results.map((r) => r.currentRank)).toEqual(["builder", "builder"]);
    expect(results.filter((r) => r.awarded === "builder")).toHaveLength(1);

    const awards = await db.select().from(rankAwards).where(eq(rankAwards.userId, "bld"));
    expect(awards).toMatchObject([{ rank: "builder", rulesetVersion: "v1", awardedBy: "system" }]);
    const [event] = await db.select().from(builderEvents).where(eq(builderEvents.id, awards[0].eventId!));
    expect(event).toMatchObject({ kind: "rank", eventType: "rank_builder", verification: "system_verified", subjectUserId: "bld" });
    expect((await evaluateRank(db, "bld", { now: NOW })).awarded).toBeNull();
  });

  it("never downgrades automatically and reports inactivity separately", async () => {
    const ships = await seedBuilder("bld");
    await evaluateRank(db, "bld", { now: NOW });
    for (const ship of ships) await reverse(db, "bld", ship.id!, ship);

    const afterReversals = await evaluateRank(db, "bld", { now: NOW });
    expect(afterReversals.checklist.eligibleRank).toBe("apprentice");
    expect(afterReversals).toMatchObject({ currentRank: "builder", awarded: null, inactive: false });

    const quiet = await evaluateRank(db, "bld", { now: ago(-120), dryRun: true });
    expect(quiet).toMatchObject({ currentRank: "builder", inactive: true });
    expect((await getCurrentRank(db, "bld")).rank).toBe("builder");
  });

  it("opens the Contributor path under ruleset v2", async () => {
    await addUsers(db, ["helper"], { createdAt: ago(60) });
    for (let i = 0; i < 8; i++) {
      await addLedger(db, "helper", { stage: "contribute", rp: 15, at: ago(i * 7 + 2), awardType: "contribute_contributor_work" });
      await addLedger(db, "helper", { stage: "contribute", rp: 5, at: ago(i * 7 + 1), awardType: "contribute_weekly_feedback" });
    }
    const underV1 = await evaluateRank(db, "helper", { now: NOW, dryRun: true });
    expect(underV1.checklist.eligibleRank).toBe("apprentice");
    const underV2 = await evaluateRank(db, "helper", { now: local(2026, 10, 21), dryRun: true });
    expect(underV2).toMatchObject({ rulesetVersion: "v2", checklist: { eligibleRank: "builder" } });
  });

  it("needs two admin mentor nominations in the current year for Legend", async () => {
    await addUsers(db, ["legend"], { createdAt: ago(400) });
    await addUsers(db, ["fan", "h1", "h2", "h3", "h4", "h5"]);
    await addUsers(db, ["admin-a", "admin-b"], { role: "admin" });
    for (let i = 0; i < 57; i++) {
      await addLedger(db, "legend", { stage: "contribute", rp: 5, at: ago(i * 7 + 1), awardType: "contribute_weekly_feedback" });
    }
    for (let i = 0; i < 100; i++) {
      await addLedger(db, "legend", { stage: "ship", rp: 20, at: ago(i * 3 + 2), awardType: "ship_public_post" });
    }
    for (let i = 0; i < 2; i++) {
      await addLedger(db, "legend", { stage: "ship", rp: 25, at: ago(i + 5), awardType: "ship_highlighted_post" });
    }
    for (const helped of ["h1", "h2", "h3", "h4", "h5"]) {
      const eventId = await addEvent(db, "legend", { stage: "contribute", eventType: "contribute_peer_help", at: ago(20), payload: { counterpartyUserId: helped } });
      await addLedger(db, "legend", { stage: "contribute", rp: 8, at: ago(20), awardType: "contribute_peer_help", eventId });
    }
    await addLedger(db, "legend", { stage: "contribute", rp: 50, at: ago(30), awardType: "contribute_featured" });
    // Nineteen other participants keep one Legend within the 5 % member share.
    for (let i = 0; i < 19; i++) await addLedger(db, `member-${i}`, { stage: "ship", rp: 10, at: ago(3) });

    const before = await evaluateRank(db, "legend", { now: NOW });
    expect(before).toMatchObject({ currentRank: "master", awarded: "master" });
    expect(before.stats).toMatchObject({ peopleHelped: 5, highlightedPosts: 2, hasFeaturedContribution: true, shipCount: 102 });

    // Last year's nomination and a non-admin nomination do not count.
    await db.insert(mentorNominations).values({ nomineeUserId: "legend", mentorUserId: "admin-b", rank: "legend", year: 2025 });
    await recordNomination(db, { nomineeUserId: "legend", mentorUserId: "fan", now: NOW });
    await recordNomination(db, { nomineeUserId: "legend", mentorUserId: "admin-a", now: NOW });
    expect(await recordNomination(db, { nomineeUserId: "legend", mentorUserId: "admin-a", now: NOW })).toEqual({ created: false, year: 2026 });
    const oneMentor = await evaluateRank(db, "legend", { now: NOW });
    expect(oneMentor).toMatchObject({ currentRank: "master", awarded: null });
    expect(oneMentor.stats.mentorNominations.legend).toBe(1);

    await recordNomination(db, { nomineeUserId: "legend", mentorUserId: "admin-b", now: NOW });
    expect(await evaluateRank(db, "legend", { now: NOW })).toMatchObject({ currentRank: "legend", awarded: "legend" });
  });

  it("scores Premium and VIP members with the same history identically", async () => {
    await seedBuilder("prem");
    await seedBuilder("vip");
    const future = new Date(Date.now() + 30 * DAY);
    for (const [userId, product] of [["prem", "prod_premium"], ["vip", "prod_vip"]] as const) {
      const customerId = crypto.randomUUID();
      await db.insert(customers).values({ id: customerId, email: `${userId}@example.com`, userId });
      await db.insert(subscriptions).values({
        customerId,
        polarSubscriptionId: `sub_${userId}`,
        polarProductId: product,
        productName: product,
        status: "active",
        currentPeriodEnd: future,
      });
    }
    expect(await getCommunityTier(db, "prem")).toBe("premium");
    expect(await getCommunityTier(db, "vip")).toBe("vip");

    const [prem, vip] = await Promise.all([evaluateRank(db, "prem", { now: NOW, dryRun: true }), evaluateRank(db, "vip", { now: NOW, dryRun: true })]);
    expect(prem.stats).toEqual(vip.stats);
    expect(prem.checklist).toEqual(vip.checklist);

    const board = await computeBoard(db, "overall", "month", "2026-09", NOW);
    const [a, b] = ["prem", "vip"].map((id) => board.entries.find((entry) => entry.userId === id)!);
    expect({ ...a, userId: "", position: 0 }).toEqual({ ...b, userId: "", position: 0 });
  });
});
