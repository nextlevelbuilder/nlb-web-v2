import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { badgeAwards, builderEvents, builderModerationActions, builderPilotMembers } from "@/lib/db/schema";
import {
  BADGES,
  buildBadgeViews,
  computeBadgeCandidates,
  evaluateBadges,
  getBadgeAwards,
  getBadgeShareCard,
  listRecentBadgeAwards,
  revokeBadge,
} from "@/lib/builder-league/badges";
import { reverseAward, awardForEvent } from "@/lib/builder-league/ledger";
import { at, seedMembers, verified } from "./progression-fixtures";

let local: LocalD1;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));
  local = await createLocalD1();
  await seedMembers(local.db);
});

afterEach(async () => {
  vi.useRealTimers();
  await local.dispose();
});

const keysOf = async (userId: string) =>
  (await getBadgeAwards(local.db, userId)).map((a) => `${a.badgeKey}${a.seasonKey ? `@${a.seasonKey}` : ""}`).sort();

describe("badge catalogue", () => {
  it("defines every suggested badge with EN/VI copy, a stage and a roman numeral", () => {
    expect(BADGES.map((b) => b.key)).toEqual([
      "signal_hunter",
      "idea_slayer",
      "first_builder",
      "first_ship",
      "first_dollar",
      "growth_explorer",
      "community_hero",
      "comeback_builder",
      "nlb_pioneer",
    ]);
    for (const badge of BADGES) {
      expect(badge.name.en && badge.name.vi && badge.description.vi && badge.criteria.vi).toBeTruthy();
      expect(badge.numeral).toMatch(/^[IVX]+$/);
    }
    expect(BADGES.filter((b) => b.seasonal).length).toBeGreaterThan(0);
  });

  it("never triggers on volume, Discord activity or self-reported claims", () => {
    const events = Array.from({ length: 50 }, (_, i) => ({
      id: `e${i}`,
      eventType: i % 2 ? ("ship_public_post" as const) : ("contribute_discord_active" as const),
      stage: i % 2 ? ("ship" as const) : ("contribute" as const),
      projectId: null,
      occurredAt: at(i),
      verification: "system_verified" as const,
      counterpartyUserId: null,
    }));
    // Comeback needs a gap; dense volume has none, so nothing is earned.
    expect(computeBadgeCandidates({ events, isPilot: false })).toEqual([]);
  });
});

describe("badge evaluation on local D1", () => {
  it("awards from verified events only and stores the evidence event ids", async () => {
    await verified(local.db, "u1", "build_mvp", at(1), { verification: "self_reported", actorRole: "member", source: "member" });
    expect(await evaluateBadges(local.db, "u1")).toEqual([]);

    const launch = await verified(local.db, "u1", "ship_product_launch", at(2));
    const created = await evaluateBadges(local.db, "u1");
    expect(created.map((a) => `${a.badgeKey}@${a.seasonKey}`).sort()).toEqual(["first_ship@", "first_ship@S2026-1"]);
    expect(created[0].eventIds).toEqual([launch.id]);

    const badgeEvents = await local.db.select().from(builderEvents).where(eq(builderEvents.kind, "badge"));
    expect(badgeEvents).toHaveLength(2);
    expect(badgeEvents[0]).toMatchObject({ actorRole: "system", verification: "system_verified", subjectUserId: "u1" });

    const recent = await listRecentBadgeAwards(local.db);
    expect(recent.map((row) => [row.memberName, row.award.badgeKey])).toEqual([
      ["Member u1", "first_ship"],
      ["Member u1", "first_ship"],
    ]);
  });

  it("is idempotent across repeated and concurrent evaluations", async () => {
    await verified(local.db, "u1", "validate_stop_pivot", at(3));
    await Promise.all([evaluateBadges(local.db, "u1"), evaluateBadges(local.db, "u1"), evaluateBadges(local.db, "u1")]);
    expect(await evaluateBadges(local.db, "u1")).toEqual([]);
    expect(await keysOf("u1")).toEqual(["idea_slayer", "idea_slayer@S2026-1"]);
    expect(await local.db.select().from(builderEvents).where(eq(builderEvents.kind, "badge"))).toHaveLength(2);
  });

  it("never awards a badge for membership or payment of the member themselves", async () => {
    // No events at all: a paying member with nothing verified earns nothing.
    expect(await evaluateBadges(local.db, "u2")).toEqual([]);
  });

  it("drops events that were reversed", async () => {
    const payment = await verified(local.db, "u1", "ship_first_payment", at(4));
    const entry = await awardForEvent(local.db, payment.id, { actorId: "admin", actorRole: "admin" });
    await reverseAward(local.db, entry!.id, { actorId: "admin", actorRole: "admin", reason: "self-purchase" });
    expect(await evaluateBadges(local.db, "u1")).toEqual([]);
  });

  it("requires sustained help to distinct builders for Community Hero", async () => {
    const help = (day: number, counterparty: string) =>
      verified(local.db, "u1", "contribute_peer_help", at(day), {
        verification: "peer_confirmed",
        payload: { counterpartyUserId: counterparty },
      });
    await help(0, "u2");
    await help(1, "u2");
    await help(2, "u2");
    await help(3, "u2");
    await help(4, "u2");
    expect(await keysOf("u1")).toEqual([]);
    await evaluateBadges(local.db, "u1");
    expect(await keysOf("u1")).toEqual([]); // five sessions, one person, one week
    await help(8, "u3");
    await help(15, "u4");
    await evaluateBadges(local.db, "u1");
    expect(await keysOf("u1")).toEqual(["community_hero", "community_hero@S2026-1"]);
  });

  it("recognises a comeback after eight quiet weeks and the pilot pioneer", async () => {
    await verified(local.db, "u3", "validate_problem_signal", at(1));
    await verified(local.db, "u3", "validate_problem_signal", at(1 + 7 * 8 + 1));
    await local.db.insert(builderPilotMembers).values({ userId: "u3", addedBy: "admin" });
    await evaluateBadges(local.db, "u3");
    expect(await keysOf("u3")).toEqual(["comeback_builder", "nlb_pioneer"]);
  });

  it("revokes with a reason and an audit row, and never re-grants", async () => {
    await verified(local.db, "u1", "build_mvp", at(5));
    const [award] = await evaluateBadges(local.db, "u1");
    await expect(revokeBadge(local.db, { awardId: award.id, actorId: "u1", actorRole: "member", reason: "x" })).rejects.toMatchObject({ status: 403 });
    await expect(revokeBadge(local.db, { awardId: award.id, actorId: "admin", actorRole: "admin", reason: " " })).rejects.toMatchObject({ status: 400 });
    const revoked = await revokeBadge(local.db, { awardId: award.id, actorId: "admin", actorRole: "admin", reason: "fake MVP" });
    expect(revoked).toMatchObject({ revokeReason: "fake MVP" });
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(await revokeBadge(local.db, { awardId: award.id, actorId: "admin", actorRole: "admin", reason: "again" })).toMatchObject({ revokeReason: "fake MVP" });

    const audit = await local.db.select().from(builderModerationActions).where(eq(builderModerationActions.targetId, award.id));
    expect(audit).toHaveLength(1);
    expect(await evaluateBadges(local.db, "u1")).toEqual([]);
    expect(await getBadgeAwards(local.db, "u1")).toEqual([]);
    expect(await local.db.select().from(badgeAwards)).toHaveLength(1);
    expect(buildBadgeViews(await getBadgeAwards(local.db, "u1", { includeRevoked: true }), "en").find((v) => v.key === "first_builder")?.earned).toBeNull();
  });

  it("builds share card data for the holder only, without evidence", async () => {
    await verified(local.db, "u1", "ship_distribution_case_study", at(6));
    const [award] = await evaluateBadges(local.db, "u1");
    expect(await getBadgeShareCard(local.db, award.id, "u2", "en")).toBeNull();
    const card = await getBadgeShareCard(local.db, award.id, "u1", "vi");
    expect(card).toMatchObject({ badgeKey: "growth_explorer", numeral: "VI", name: "Nhà thám hiểm tăng trưởng", evidenceCount: 1 });
    expect(card).not.toHaveProperty("eventIds");
  });
});
