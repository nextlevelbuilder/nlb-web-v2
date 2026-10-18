import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { badgeAwards, builderModerationActions, leagueSnapshots, rankAwards, rewardClaims, rewardItems, users } from "@/lib/db/schema";
import {
  INITIAL_REWARD_CATALOGUE,
  cancelOwnClaim,
  claimReward,
  decideClaim,
  expireDueClaims,
  listClaimsForAdmin,
  listRewardsForMember,
  rewardEligibilitySchema,
  seedRewardCatalogue,
  upsertRewardItem,
  type RewardItemInput,
} from "@/lib/builder-league/rewards";
import { at, seedMembers, verified } from "./progression-fixtures";

const ADMIN = { actorId: "admin", actorRole: "admin" as const };
/** Mid season S2026-2 (starts 2026-12-14 local). */
const NOW = new Date("2027-01-05T03:00:00Z");

let local: LocalD1;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

beforeEach(async () => {
  local = await createLocalD1();
  await seedMembers(local.db);
  await local.db.insert(users).values(
    Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `Claimer ${i}`, email: `c${i}@example.com` }))
  );
});

afterEach(async () => {
  await local.dispose();
});

const item = (overrides: Partial<RewardItemInput> = {}): RewardItemInput => ({
  key: "review",
  kind: "launch_review",
  title: { en: "Review", vi: "Review" },
  description: { en: "A review", vi: "Một buổi review" },
  eligibility: { period: "season", anyOf: [{ type: "badge", key: "first_builder" }] },
  inventory: null,
  active: true,
  ...overrides,
});

async function giveBadge(userId: string, badgeKey = "first_builder") {
  await local.db.insert(badgeAwards).values({ userId, badgeKey, eventIds: ["e"] });
}

describe("reward eligibility rules", () => {
  it("rejects tier, RP prices and volume milestones, and requires a real requirement", () => {
    expect(rewardEligibilitySchema.safeParse({ anyOf: [{ type: "tier", min: "vip" }] }).success).toBe(false);
    expect(rewardEligibilitySchema.safeParse({ rpCost: 500, anyOf: [{ type: "badge", key: "first_ship" }] }).success).toBe(false);
    expect(rewardEligibilitySchema.safeParse({ anyOf: [{ type: "verified_milestone", eventType: "ship_public_post" }] }).success).toBe(false);
    expect(rewardEligibilitySchema.safeParse({ anyOf: [{ type: "verified_milestone", eventType: "contribute_discord_active" }] }).success).toBe(false);
    expect(rewardEligibilitySchema.safeParse({ period: "season" }).success).toBe(false);
    for (const seed of INITIAL_REWARD_CATALOGUE) expect(rewardEligibilitySchema.safeParse(seed.eligibility).success).toBe(true);
  });

  it("evaluates rank, badge, verified milestones and last season's final placement", async () => {
    const reward = await upsertRewardItem(
      local.db,
      item({
        key: "combo",
        eligibility: {
          period: "season",
          allOf: [{ type: "rank", min: "builder" }, { type: "verified_milestone", eventType: "build_mvp" }],
          anyOf: [{ type: "season_placement", board: "overall", maxPlace: 2 }, { type: "badge", key: "first_dollar" }],
        },
      }),
      ADMIN
    );
    await local.db.insert(rankAwards).values({ userId: "u1", rank: "architect", rulesetVersion: "v2" });
    await verified(local.db, "u1", "build_mvp", at(3));
    await local.db.insert(leagueSnapshots).values({
      board: "overall",
      periodType: "season",
      periodKey: "S2026-1",
      revision: 1,
      status: "final",
      rulesetVersion: "v2",
      watermarkAt: NOW,
      eventHash: "h",
      entries: [{ userId: "u2", score: 90 }, { userId: "u1", score: 80 }, { userId: "u3", score: 10 }],
    });
    const [view] = await listRewardsForMember(local.db, "u1");
    expect(view.eligibility).toMatchObject({ eligible: true });
    expect((await listRewardsForMember(local.db, "u3"))[0].eligibility?.eligible).toBe(false);
    await expect(claimReward(local.db, "u3", reward.id)).rejects.toMatchObject({ status: 403, code: "not_eligible" });
  });

  it("ignores membership tier entirely: a VIP without verified progress is not eligible", async () => {
    const reward = await upsertRewardItem(local.db, item(), ADMIN);
    await expect(claimReward(local.db, "u2", reward.id)).rejects.toMatchObject({ code: "not_eligible" });
  });
});

describe("reward claims on local D1", () => {
  it("allows one claim per member and period", async () => {
    const reward = await upsertRewardItem(local.db, item(), ADMIN);
    await giveBadge("u1");
    const claim = await claimReward(local.db, "u1", reward.id, { note: "launching in March" });
    expect(claim).toMatchObject({ status: "requested", periodKey: "S2026-2" });
    await expect(claimReward(local.db, "u1", reward.id)).rejects.toMatchObject({ status: 409, code: "already_claimed" });
    // Next season is a new period.
    const later = await claimReward(local.db, "u1", reward.id, { now: new Date("2027-03-01T03:00:00Z") });
    expect(later.periodKey).toBe("S2027-3");

    const queue = await listClaimsForAdmin(local.db, { status: "requested" });
    expect(queue.map((row) => [row.memberName, row.rewardKey, row.claim.periodKey])).toEqual([
      ["Member u1", reward.key, "S2027-3"],
      ["Member u1", reward.key, "S2026-2"],
    ]);
    expect(await listClaimsForAdmin(local.db, { status: "approved" })).toEqual([]);
  });

  it("never oversells under concurrent claims", async () => {
    const reward = await upsertRewardItem(local.db, item({ inventory: 3 }), ADMIN);
    for (let i = 0; i < 8; i++) await giveBadge(`c${i}`);
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => claimReward(local.db, `c${i}`, reward.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "out_of_stock" });
    const [stock] = await local.db.select().from(rewardItems).where(eq(rewardItems.id, reward.id));
    expect(stock.inventory).toBe(0);
    expect(await local.db.select().from(rewardClaims)).toHaveLength(3);
  });

  it("respects the availability window and inactive items", async () => {
    const future = await upsertRewardItem(local.db, item({ key: "later", availableFrom: new Date("2027-02-01T00:00:00Z") }), ADMIN);
    const past = await upsertRewardItem(local.db, item({ key: "past", availableUntil: new Date("2026-12-01T00:00:00Z") }), ADMIN);
    const off = await upsertRewardItem(local.db, item({ key: "off", active: false }), ADMIN);
    await giveBadge("u1");
    await expect(claimReward(local.db, "u1", future.id)).rejects.toMatchObject({ code: "reward_not_open" });
    await expect(claimReward(local.db, "u1", past.id)).rejects.toMatchObject({ code: "reward_closed" });
    await expect(claimReward(local.db, "u1", off.id)).rejects.toMatchObject({ status: 404 });
    expect((await listRewardsForMember(local.db, "u1")).map((r) => r.item.key)).toEqual(["later"]);
  });

  it("runs approve → redeem with audit, and releases stock on reject, cancel and expiry", async () => {
    const reward = await upsertRewardItem(local.db, item({ inventory: 2 }), ADMIN);
    await giveBadge("u1");
    await giveBadge("u2");
    await giveBadge("u3");
    const stock = async () => (await local.db.select().from(rewardItems).where(eq(rewardItems.id, reward.id)))[0].inventory;

    const a = await claimReward(local.db, "u1", reward.id);
    const b = await claimReward(local.db, "u2", reward.id);
    expect(await stock()).toBe(0);
    await expect(decideClaim(local.db, { claimId: a.id, action: "approve", actorId: "u3", actorRole: "member" })).rejects.toMatchObject({ status: 403 });

    const approved = await decideClaim(local.db, { claimId: a.id, action: "approve", ...ADMIN, redeemWithinDays: 7 });
    expect(approved.expiresAt!.getTime()).toBe(NOW.getTime() + 7 * 86_400_000);
    await expect(decideClaim(local.db, { claimId: a.id, action: "approve", ...ADMIN })).rejects.toMatchObject({ code: "invalid_transition" });
    expect(await decideClaim(local.db, { claimId: a.id, action: "redeem", ...ADMIN })).toMatchObject({ status: "redeemed" });
    expect(await stock()).toBe(0);

    await Promise.allSettled([
      decideClaim(local.db, { claimId: b.id, action: "reject", ...ADMIN, note: "not launched yet" }),
      decideClaim(local.db, { claimId: b.id, action: "reject", ...ADMIN }),
    ]);
    expect(await stock()).toBe(1); // released exactly once

    const c = await claimReward(local.db, "u3", reward.id);
    await expect(cancelOwnClaim(local.db, "u1", c.id)).rejects.toMatchObject({ status: 404 });
    expect(await cancelOwnClaim(local.db, "u3", c.id)).toMatchObject({ status: "cancelled" });
    expect(await stock()).toBe(1);

    const audit = await local.db.select().from(builderModerationActions).where(eq(builderModerationActions.targetType, "reward_claim"));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["approve", "redeem", "reject", "cancel"]));
  });

  it("expires approved claims after their redemption window and frees the unit", async () => {
    const reward = await upsertRewardItem(local.db, item({ inventory: 1 }), ADMIN);
    await giveBadge("u1");
    const claim = await claimReward(local.db, "u1", reward.id);
    await decideClaim(local.db, { claimId: claim.id, action: "approve", ...ADMIN, redeemWithinDays: 1 });
    expect(await expireDueClaims(local.db, new Date(NOW.getTime() + 12 * 3_600_000))).toBe(0);
    expect(await expireDueClaims(local.db, new Date(NOW.getTime() + 2 * 86_400_000))).toBe(1);
    const [row] = await local.db.select().from(rewardItems).where(eq(rewardItems.id, reward.id));
    expect(row.inventory).toBe(1);
  });

  it("seeds the initial catalogue idempotently and inactive", async () => {
    expect(await seedRewardCatalogue(local.db, ADMIN)).toHaveLength(5);
    expect(await seedRewardCatalogue(local.db, ADMIN)).toEqual([]);
    const items = await local.db.select().from(rewardItems);
    expect(items.map((i) => i.kind).sort()).toEqual(["co_launch", "distribution_intro", "editorial_exposure", "launch_review", "mentorship"]);
    expect(items.every((i) => !i.active)).toBe(true);
    expect(items.find((i) => i.kind === "mentorship")?.inventory).toBe(4);
    await expect(seedRewardCatalogue(local.db, { actorId: "u1", actorRole: "member" })).rejects.toMatchObject({ status: 403 });
  });
});
