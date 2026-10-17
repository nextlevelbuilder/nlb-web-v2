/**
 * Reward catalogue and claims.
 *
 * - Rewards are opportunities (editorial exposure, launch review, mentorship, introductions,
 *   co-launch), never cash. RP is never spent and cannot be exchanged for anything.
 * - Eligibility is a strict JSON rule over rank, badges, last season's placement and verified
 *   milestones. Membership tier and RP balances are not expressible, so they can never matter.
 * - One claim per reward, member and period (`reward_claims` unique key).
 * - Inventory is decremented in the same D1 batch as the claim insert, guarded by `inventory > 0`, so
 *   concurrent claims can never oversell. Rejected, cancelled and expired claims give the unit back.
 * - Every admin decision writes a moderator audit row in the same batch.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { badgeAwards, rankAwards, rewardClaims, rewardItems } from "@/lib/db/schema";
import { moderationActionInsert } from "./audit";
import { BADGE_KEYS, getBadge } from "./badges";
import { BuilderApiError } from "./http";
import { getLastSeasonPlacement } from "./seasons";
import { periodKey } from "./time-windows";
import { getVerifiedHistory } from "./verified-history";
import { BOARD_KEYS, EVENT_TYPE_KEYS, RANK_KEYS, type ActorRole, type RankKey } from "./types";

export type RewardItem = typeof rewardItems.$inferSelect;
export type RewardClaim = typeof rewardClaims.$inferSelect;
export type RewardClaimStatus = RewardClaim["status"];

/** Volume-style activity never unlocks a reward. */
const MILESTONE_EVENT_TYPES = EVENT_TYPE_KEYS.filter((key) => key !== "ship_public_post" && key !== "contribute_discord_active") as [
  (typeof EVENT_TYPE_KEYS)[number],
  ...(typeof EVENT_TYPE_KEYS)[number][],
];

export const rewardRequirementSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rank"), min: z.enum(RANK_KEYS) }).strict(),
  z.object({ type: z.literal("badge"), key: z.enum(BADGE_KEYS) }).strict(),
  z
    .object({ type: z.literal("season_placement"), board: z.enum(BOARD_KEYS), maxPlace: z.number().int().min(1).max(100) })
    .strict(),
  z
    .object({ type: z.literal("verified_milestone"), eventType: z.enum(MILESTONE_EVENT_TYPES), count: z.number().int().min(1).max(20).default(1) })
    .strict(),
]);
export type RewardRequirement = z.infer<typeof rewardRequirementSchema>;

export const REWARD_PERIODS = ["season", "year", "once"] as const;
export type RewardPeriod = (typeof REWARD_PERIODS)[number];

/** Strict: unknown keys such as a tier or an RP price are rejected. At least one requirement is needed. */
export const rewardEligibilitySchema = z
  .object({
    period: z.enum(REWARD_PERIODS).default("season"),
    allOf: z.array(rewardRequirementSchema).max(10).default([]),
    anyOf: z.array(rewardRequirementSchema).max(10).default([]),
  })
  .strict()
  .refine((value) => value.allOf.length + value.anyOf.length > 0, { message: "At least one requirement is needed." });
export type RewardEligibility = z.infer<typeof rewardEligibilitySchema>;

export const REWARD_KINDS = ["editorial_exposure", "launch_review", "mentorship", "distribution_intro", "co_launch"] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

const localized = z.object({ en: z.string().trim().min(1).max(200), vi: z.string().trim().min(1).max(200) }).strict();
const localizedLong = z.object({ en: z.string().trim().min(1).max(1000), vi: z.string().trim().min(1).max(1000) }).strict();

export const rewardItemInputSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,62}$/),
    kind: z.enum(REWARD_KINDS),
    title: localized,
    description: localizedLong,
    eligibility: rewardEligibilitySchema,
    inventory: z.number().int().min(0).max(10_000).nullable().default(null),
    budgetNote: z.string().trim().max(500).nullable().optional(),
    availableFrom: z.coerce.date().nullable().optional(),
    availableUntil: z.coerce.date().nullable().optional(),
    active: z.boolean().default(false),
  })
  .strict()
  .refine((v) => !v.availableFrom || !v.availableUntil || v.availableFrom < v.availableUntil, {
    message: "availableFrom must be before availableUntil.",
    path: ["availableUntil"],
  });
export type RewardItemInput = z.input<typeof rewardItemInputSchema>;

/** Days an approved claim stays redeemable before it expires and frees its unit. */
export const DEFAULT_REDEEM_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseEligibility(item: Pick<RewardItem, "eligibility">): RewardEligibility | null {
  const parsed = rewardEligibilitySchema.safeParse(item.eligibility);
  return parsed.success ? parsed.data : null;
}

export function claimPeriodKey(period: RewardPeriod, now: Date): string {
  return period === "once" ? "once" : periodKey(period, now);
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface EligibilityFacts {
  rank: RankKey | null;
  badges: Set<string>;
  milestones: Map<string, number>;
  placement: (board: string) => Promise<number | null>;
}

export async function loadEligibilityFacts(db: AppDb, userId: string, now: Date = new Date()): Promise<EligibilityFacts> {
  const [ranks, badges, history] = await Promise.all([
    db.select({ rank: rankAwards.rank }).from(rankAwards).where(eq(rankAwards.userId, userId)),
    db
      .select({ key: badgeAwards.badgeKey })
      .from(badgeAwards)
      .where(and(eq(badgeAwards.userId, userId), isNull(badgeAwards.revokedAt))),
    getVerifiedHistory(db, userId),
  ]);
  const rankIndex = Math.max(-1, ...ranks.map((row) => RANK_KEYS.indexOf(row.rank)));
  const milestones = new Map<string, number>();
  for (const event of history) milestones.set(event.eventType, (milestones.get(event.eventType) ?? 0) + 1);
  const placements = new Map<string, Promise<number | null>>();
  return {
    rank: rankIndex >= 0 ? RANK_KEYS[rankIndex] : null,
    badges: new Set(badges.map((row) => row.key)),
    milestones,
    placement: (board) => {
      if (!placements.has(board)) {
        placements.set(board, getLastSeasonPlacement(db, userId, board, now).then((p) => p?.place ?? null));
      }
      return placements.get(board)!;
    },
  };
}

export interface RequirementResult {
  requirement: RewardRequirement;
  met: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  period: RewardPeriod;
  allOf: RequirementResult[];
  anyOf: RequirementResult[];
}

async function requirementMet(requirement: RewardRequirement, facts: EligibilityFacts): Promise<boolean> {
  switch (requirement.type) {
    case "rank":
      return facts.rank !== null && RANK_KEYS.indexOf(facts.rank) >= RANK_KEYS.indexOf(requirement.min);
    case "badge":
      return facts.badges.has(requirement.key);
    case "season_placement": {
      const place = await facts.placement(requirement.board);
      return place !== null && place <= requirement.maxPlace;
    }
    case "verified_milestone":
      return (facts.milestones.get(requirement.eventType) ?? 0) >= requirement.count;
  }
}

export async function evaluateEligibility(eligibility: RewardEligibility, facts: EligibilityFacts): Promise<EligibilityResult> {
  const check = (list: RewardRequirement[]) =>
    Promise.all(list.map(async (requirement) => ({ requirement, met: await requirementMet(requirement, facts) })));
  const [allOf, anyOf] = await Promise.all([check(eligibility.allOf), check(eligibility.anyOf)]);
  const eligible = allOf.every((r) => r.met) && (anyOf.length === 0 || anyOf.some((r) => r.met));
  return { eligible, period: eligibility.period, allOf, anyOf };
}

// ---------------------------------------------------------------------------
// Member reads and claims
// ---------------------------------------------------------------------------

export type Availability = "open" | "upcoming" | "closed" | "out_of_stock";

export function availabilityOf(item: Pick<RewardItem, "availableFrom" | "availableUntil" | "inventory">, now: Date): Availability {
  if (item.availableFrom && item.availableFrom > now) return "upcoming";
  if (item.availableUntil && item.availableUntil < now) return "closed";
  if (item.inventory !== null && item.inventory <= 0) return "out_of_stock";
  return "open";
}

export interface MemberReward {
  item: RewardItem;
  availability: Availability;
  eligibility: EligibilityResult | null;
  periodKey: string | null;
  claim: RewardClaim | null;
}

/** Active rewards that are open or upcoming, with the member's eligibility and claim for this period. */
export async function listRewardsForMember(db: AppDb, userId: string, now: Date = new Date()): Promise<MemberReward[]> {
  const [items, facts, claims] = await Promise.all([
    db.select().from(rewardItems).where(eq(rewardItems.active, true)).orderBy(asc(rewardItems.createdAt)),
    loadEligibilityFacts(db, userId, now),
    db.select().from(rewardClaims).where(eq(rewardClaims.userId, userId)),
  ]);
  const visible = items.filter((item) => availabilityOf(item, now) !== "closed");
  return Promise.all(
    visible.map(async (item) => {
      const rule = parseEligibility(item);
      const currentPeriod = rule ? claimPeriodKey(rule.period, now) : null;
      return {
        item,
        availability: availabilityOf(item, now),
        eligibility: rule ? await evaluateEligibility(rule, facts) : null,
        periodKey: currentPeriod,
        claim: claims.find((c) => c.rewardId === item.id && c.periodKey === currentPeriod) ?? null,
      };
    })
  );
}

export async function listMemberClaims(db: AppDb, userId: string): Promise<RewardClaim[]> {
  return db.select().from(rewardClaims).where(eq(rewardClaims.userId, userId)).orderBy(desc(rewardClaims.createdAt));
}

function isUniqueViolation(err: unknown): boolean {
  for (let current: unknown = err, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error && /UNIQUE constraint failed/i.test(current.message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

async function runBatch(db: AppDb, statements: BatchItem<"sqlite">[]): Promise<void> {
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

/**
 * Requests a reward for the current period. Throws 404 (unknown or inactive), 409 (window, stock or
 * already claimed) or 403 (`not_eligible`, with the per-requirement result as details).
 */
export async function claimReward(
  db: AppDb,
  userId: string,
  rewardId: string,
  { now = new Date(), note = null }: { now?: Date; note?: string | null } = {}
): Promise<RewardClaim> {
  const [item] = await db.select().from(rewardItems).where(eq(rewardItems.id, rewardId)).limit(1);
  if (!item || !item.active) throw new BuilderApiError(404, "reward_not_found", "Reward not found.");
  const availability = availabilityOf(item, now);
  if (availability === "upcoming") throw new BuilderApiError(409, "reward_not_open", "This reward is not open yet.");
  if (availability === "closed") throw new BuilderApiError(409, "reward_closed", "This reward is closed.");
  if (availability === "out_of_stock") throw new BuilderApiError(409, "out_of_stock", "No places are left for this reward.");
  const rule = parseEligibility(item);
  if (!rule) throw new BuilderApiError(409, "reward_misconfigured", "This reward cannot be claimed right now.");
  const result = await evaluateEligibility(rule, await loadEligibilityFacts(db, userId, now));
  if (!result.eligible) throw new BuilderApiError(403, "not_eligible", "You do not meet the requirements yet.", result);

  const claimPeriod = claimPeriodKey(rule.period, now);
  const claimId = crypto.randomUUID();
  const cleanNote = note?.trim().slice(0, 500) || null;
  const statements: BatchItem<"sqlite">[] =
    item.inventory === null
      ? [
          db.insert(rewardClaims).values({
            id: claimId,
            rewardId,
            userId,
            periodKey: claimPeriod,
            status: "requested",
            note: cleanNote,
            createdAt: now,
            updatedAt: now,
          }),
        ]
      : [
          // The claim row only exists if a unit was left when the batch ran; the decrement only runs if
          // that row exists. D1 runs the batch atomically, so concurrent claims cannot oversell.
          db.insert(rewardClaims).select(
            db
              .select({
                id: sql<string>`${claimId}`.as("id"),
                rewardId: rewardItems.id,
                userId: sql<string>`${userId}`.as("user_id"),
                periodKey: sql<string>`${claimPeriod}`.as("period_key"),
                status: sql<"requested">`'requested'`.as("status"),
                note: sql<string | null>`${cleanNote}`.as("note"),
                decidedBy: sql<string | null>`null`.as("decided_by"),
                decidedAt: sql<number | null>`null`.as("decided_at"),
                expiresAt: sql<number | null>`null`.as("expires_at"),
                createdAt: sql<number>`${now.getTime()}`.as("created_at"),
                updatedAt: sql<number>`${now.getTime()}`.as("updated_at"),
              })
              .from(rewardItems)
              .where(and(eq(rewardItems.id, rewardId), gt(rewardItems.inventory, 0)))
          ),
          db
            .update(rewardItems)
            .set({ inventory: sql`${rewardItems.inventory} - 1`, updatedAt: now })
            .where(and(eq(rewardItems.id, rewardId), sql`exists (select 1 from reward_claims where id = ${claimId})`)),
        ];
  try {
    await runBatch(db, statements);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new BuilderApiError(409, "already_claimed", "You already claimed this reward for this period.", { periodKey: claimPeriod });
    }
    throw err;
  }
  const [claim] = await db.select().from(rewardClaims).where(eq(rewardClaims.id, claimId)).limit(1);
  if (!claim) throw new BuilderApiError(409, "out_of_stock", "No places are left for this reward.");
  return claim;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export const CLAIM_ACTIONS = ["approve", "reject", "redeem", "expire", "cancel"] as const;
export type ClaimAction = (typeof CLAIM_ACTIONS)[number];

const TRANSITIONS: Record<ClaimAction, { from: RewardClaimStatus[]; to: RewardClaimStatus; release: boolean }> = {
  approve: { from: ["requested"], to: "approved", release: false },
  reject: { from: ["requested"], to: "rejected", release: true },
  redeem: { from: ["approved"], to: "redeemed", release: false },
  expire: { from: ["requested", "approved"], to: "expired", release: true },
  cancel: { from: ["requested", "approved"], to: "cancelled", release: true },
};

export interface ClaimDecisionInput {
  claimId: string;
  action: ClaimAction;
  actorId: string;
  actorRole: ActorRole;
  note?: string | null;
  /** Approve only: days until an unredeemed approval expires. */
  redeemWithinDays?: number;
  now?: Date;
}

async function transitionClaim(db: AppDb, input: ClaimDecisionInput & { allowedFrom?: RewardClaimStatus[] }): Promise<RewardClaim> {
  const now = input.now ?? new Date();
  const transition = TRANSITIONS[input.action];
  const from = input.allowedFrom ?? transition.from;
  const [claim] = await db.select().from(rewardClaims).where(eq(rewardClaims.id, input.claimId)).limit(1);
  if (!claim) throw new BuilderApiError(404, "claim_not_found", "Claim not found.");
  if (!from.includes(claim.status)) {
    throw new BuilderApiError(409, "invalid_transition", `A ${claim.status} claim cannot be ${transition.to}.`, { status: claim.status });
  }
  const note = input.note?.trim().slice(0, 500) || null;
  const expiresAt =
    input.action === "approve" ? new Date(now.getTime() + Math.min(Math.max(input.redeemWithinDays ?? DEFAULT_REDEEM_DAYS, 1), 365) * DAY_MS) : claim.expiresAt;

  const statements: BatchItem<"sqlite">[] = [
    db
      .update(rewardClaims)
      .set({ status: transition.to, decidedBy: input.actorId, decidedAt: now, expiresAt, updatedAt: now, ...(note ? { note } : {}) })
      .where(and(eq(rewardClaims.id, claim.id), inArray(rewardClaims.status, from))),
  ];
  if (transition.release) {
    // `changes()` is the row count of the status update above, so a lost race never frees a unit twice.
    statements.push(
      db
        .update(rewardItems)
        .set({ inventory: sql`${rewardItems.inventory} + 1`, updatedAt: now })
        .where(and(eq(rewardItems.id, claim.rewardId), sql`${rewardItems.inventory} is not null`, sql`changes() > 0`))
    );
  }
  statements.push(
    moderationActionInsert(db, {
      targetType: "reward_claim",
      targetId: claim.id,
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      reasonCodes: [`claim_${transition.to}`],
      notes: note,
    })
  );
  await runBatch(db, statements);
  const [updated] = await db.select().from(rewardClaims).where(eq(rewardClaims.id, claim.id)).limit(1);
  if (updated.status !== transition.to || updated.decidedAt?.getTime() !== now.getTime()) {
    throw new BuilderApiError(409, "claim_changed", "The claim was changed by someone else. Reload and try again.");
  }
  return updated;
}

/** Admin decision on a claim: approve, reject, redeem, expire or cancel. */
export async function decideClaim(db: AppDb, input: ClaimDecisionInput): Promise<RewardClaim> {
  if (input.actorRole !== "admin" && !(input.actorRole === "system" && input.action === "expire")) {
    throw new BuilderApiError(403, "admin_required", "Only admins can decide reward claims.");
  }
  return transitionClaim(db, input);
}

/** A member withdraws their own request before it is decided. */
export async function cancelOwnClaim(db: AppDb, userId: string, claimId: string, now: Date = new Date()): Promise<RewardClaim> {
  const [claim] = await db.select().from(rewardClaims).where(eq(rewardClaims.id, claimId)).limit(1);
  if (!claim || claim.userId !== userId) throw new BuilderApiError(404, "claim_not_found", "Claim not found.");
  return transitionClaim(db, { claimId, action: "cancel", actorId: userId, actorRole: "member", allowedFrom: ["requested"], now });
}

/** Expires approved claims past their redemption date (cron). Returns how many expired. */
export async function expireDueClaims(db: AppDb, now: Date = new Date()): Promise<number> {
  const due = await db
    .select({ id: rewardClaims.id })
    .from(rewardClaims)
    .where(and(eq(rewardClaims.status, "approved"), lt(rewardClaims.expiresAt, now)));
  let expired = 0;
  for (const { id } of due) {
    try {
      await decideClaim(db, { claimId: id, action: "expire", actorId: "system", actorRole: "system", note: "redemption window ended", now });
      expired += 1;
    } catch (err) {
      if (!(err instanceof BuilderApiError && err.status === 409)) throw err;
    }
  }
  return expired;
}

// ---------------------------------------------------------------------------
// Admin catalogue
// ---------------------------------------------------------------------------

export async function listRewardItems(db: AppDb): Promise<RewardItem[]> {
  return db.select().from(rewardItems).orderBy(asc(rewardItems.createdAt));
}

export async function listClaims(
  db: AppDb,
  { status, limit = 100 }: { status?: RewardClaimStatus; limit?: number } = {}
): Promise<RewardClaim[]> {
  return db
    .select()
    .from(rewardClaims)
    .where(status ? eq(rewardClaims.status, status) : undefined)
    .orderBy(desc(rewardClaims.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

/** Creates or updates a catalogue item by `key` (admin), with an audit row in the same batch. */
export async function upsertRewardItem(
  db: AppDb,
  input: RewardItemInput,
  actor: { actorId: string; actorRole: ActorRole }
): Promise<RewardItem> {
  if (actor.actorRole !== "admin") throw new BuilderApiError(403, "admin_required", "Only admins can edit rewards.");
  const value = rewardItemInputSchema.parse(input);
  const now = new Date();
  const fields = {
    kind: value.kind,
    title: value.title,
    description: value.description,
    eligibility: value.eligibility as Record<string, unknown>,
    inventory: value.inventory,
    budgetNote: value.budgetNote ?? null,
    availableFrom: value.availableFrom ?? null,
    availableUntil: value.availableUntil ?? null,
    active: value.active,
    updatedAt: now,
  };
  await runBatch(db, [
    db
      .insert(rewardItems)
      .values({ id: crypto.randomUUID(), key: value.key, createdAt: now, ...fields })
      .onConflictDoUpdate({ target: rewardItems.key, set: fields }),
    moderationActionInsert(db, {
      targetType: "reward_item",
      targetId: value.key,
      action: "upsert",
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      reasonCodes: [value.active ? "active" : "inactive"],
      notes: value.budgetNote ?? null,
    }),
  ]);
  const [item] = await db.select().from(rewardItems).where(eq(rewardItems.key, value.key)).limit(1);
  return item;
}

/**
 * The initial catalogue. Seeded inactive: an admin confirms budget and capacity, then activates each
 * item. Capacities are small on purpose; they are people's time, not a currency.
 */
export const INITIAL_REWARD_CATALOGUE: readonly RewardItemInput[] = [
  {
    key: "editorial-feature",
    kind: "editorial_exposure",
    title: { en: "Editorial feature", vi: "Bài viết giới thiệu trên NLB" },
    description: {
      en: "A short editorial piece about your launch on the NLB blog and newsletter.",
      vi: "Một bài viết ngắn về sản phẩm bạn vừa ra mắt trên blog và bản tin NLB.",
    },
    eligibility: { period: "season", anyOf: [{ type: "badge", key: "first_ship" }, { type: "verified_milestone", eventType: "ship_product_launch" }] },
    inventory: 6,
    budgetNote: "Editorial time: about 6 features per season.",
  },
  {
    key: "collective-launch-review",
    kind: "launch_review",
    title: { en: "Collective launch review", vi: "Buổi review ra mắt cùng cộng đồng" },
    description: {
      en: "A live session where builders and mentors review your launch plan together.",
      vi: "Một buổi trực tiếp nơi các builder và mentor cùng góp ý kế hoạch ra mắt của bạn.",
    },
    eligibility: { period: "season", anyOf: [{ type: "verified_milestone", eventType: "build_mvp" }, { type: "rank", min: "builder" }] },
    inventory: 10,
    budgetNote: "Two review sessions per season, five slots each.",
  },
  {
    key: "mentorship-slot",
    kind: "mentorship",
    title: { en: "Mentorship slot", vi: "Một buổi mentor 1:1" },
    description: {
      en: "One 45-minute 1:1 with an NLB mentor on the problem you are stuck on.",
      vi: "Một buổi 1:1 dài 45 phút với mentor NLB về vấn đề bạn đang vướng.",
    },
    eligibility: { period: "season", anyOf: [{ type: "season_placement", board: "overall", maxPlace: 10 }, { type: "rank", min: "architect" }] },
    inventory: 4,
    budgetNote: "Mentor capacity is capped at 4 slots per season.",
  },
  {
    key: "partner-introduction",
    kind: "distribution_intro",
    title: { en: "Distribution or partner introduction", vi: "Giới thiệu kênh phân phối hoặc đối tác" },
    description: {
      en: "A warm introduction to a distribution channel or partner that fits your product.",
      vi: "Một lời giới thiệu trực tiếp tới kênh phân phối hoặc đối tác phù hợp với sản phẩm của bạn.",
    },
    eligibility: {
      period: "year",
      allOf: [{ type: "verified_milestone", eventType: "ship_product_launch" }],
      anyOf: [{ type: "badge", key: "growth_explorer" }, { type: "badge", key: "first_dollar" }],
    },
    inventory: 5,
    budgetNote: "Depends on partner availability; about 5 per year.",
  },
  {
    key: "co-launch",
    kind: "co_launch",
    title: { en: "Co-launch with NLB", vi: "Ra mắt cùng NLB" },
    description: {
      en: "NLB launches with you: shared announcement, community launch day and follow-up.",
      vi: "NLB ra mắt cùng bạn: thông báo chung, ngày ra mắt trong cộng đồng và theo dõi sau đó.",
    },
    eligibility: { period: "season", anyOf: [{ type: "season_placement", board: "ship", maxPlace: 3 }, { type: "badge", key: "first_dollar" }] },
    inventory: 2,
    budgetNote: "At most 2 co-launches per season.",
  },
];

/**
 * Inserts the initial catalogue items that do not exist yet (by key). Existing items, including any an
 * admin edited, are left untouched, so the seed is safe to run again. Returns the keys it inserted.
 */
export async function seedRewardCatalogue(db: AppDb, actor: { actorId: string; actorRole: ActorRole }): Promise<string[]> {
  if (actor.actorRole !== "admin" && actor.actorRole !== "system") {
    throw new BuilderApiError(403, "admin_required", "Only admins can seed rewards.");
  }
  const inserted: string[] = [];
  const now = new Date();
  for (const input of INITIAL_REWARD_CATALOGUE) {
    const value = rewardItemInputSchema.parse(input);
    const rows = await db
      .insert(rewardItems)
      .values({
        id: crypto.randomUUID(),
        key: value.key,
        kind: value.kind,
        title: value.title,
        description: value.description,
        eligibility: value.eligibility as Record<string, unknown>,
        inventory: value.inventory,
        budgetNote: value.budgetNote ?? null,
        active: false,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: rewardItems.key })
      .returning({ key: rewardItems.key });
    if (rows.length > 0) inserted.push(value.key);
  }
  if (inserted.length > 0) {
    await moderationActionInsert(db, {
      targetType: "reward_item",
      targetId: "catalogue",
      action: "seed",
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      reasonCodes: inserted,
    });
  }
  return inserted;
}

/** Human label for a requirement, used by pages and the API. */
export function describeRequirement(requirement: RewardRequirement, locale: "en" | "vi"): string {
  const vi = locale === "vi";
  switch (requirement.type) {
    case "rank":
      return vi ? `Đạt hạng ${requirement.min} trở lên` : `Rank ${requirement.min} or higher`;
    case "badge": {
      const name = getBadge(requirement.key)?.name[locale] ?? requirement.key;
      return vi ? `Huy hiệu ${name}` : `${name} badge`;
    }
    case "season_placement":
      return vi
        ? `Top ${requirement.maxPlace} bảng ${requirement.board} mùa trước`
        : `Top ${requirement.maxPlace} on the ${requirement.board} board last season`;
    case "verified_milestone":
      return vi
        ? `${requirement.count} × ${requirement.eventType} đã xác minh`
        : `${requirement.count} verified ${requirement.eventType}`;
  }
}
