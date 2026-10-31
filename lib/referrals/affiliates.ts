import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliateConversions, affiliates, customers, subscriptions, users } from "@/lib/db/schema";
import { getMemberTier, isUniqueViolation, toMembershipState } from "@/lib/membership/member-access";
import { resolveEffectiveTier, type EffectiveTier } from "@/lib/membership/effective-tier";
import { getPastDueGraceDays } from "@/lib/onboarding/flags";
import { budgetFor, levelFor, nextLevel } from "./program-math";
import { getActiveRules, type ActiveRules } from "./program-rules";
import { ReferralError } from "./referral-errors";
import type { AffiliateIncentiveBasis, AffiliateStatus, ProgramLevel } from "./types";

export type AffiliateRow = typeof affiliates.$inferSelect;

export async function findAffiliateByUser(db: AppDb, userId: string): Promise<AffiliateRow | null> {
  const [row] = await db.select().from(affiliates).where(eq(affiliates.userId, userId)).limit(1);
  return row ?? null;
}

export async function findAffiliateById(db: AppDb, affiliateId: string): Promise<AffiliateRow | null> {
  const [row] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
  return row ?? null;
}

/** The caller's affiliate account, active; otherwise `not_enrolled` (404) or `affiliate_suspended` (403). */
export async function requireActiveAffiliate(db: AppDb, userId: string): Promise<AffiliateRow> {
  const affiliate = await findAffiliateByUser(db, userId);
  if (!affiliate) throw new ReferralError(404, "not_enrolled", "Join the affiliate program first");
  if (affiliate.status !== "active") throw new ReferralError(403, "affiliate_suspended", "This affiliate account is suspended");
  return affiliate;
}

/** Verified, non-banned users may join. Checked on enrolment and on every checkout attribution. */
export async function assertEligibleUser(db: AppDb, userId: string): Promise<void> {
  const [user] = await db.select({ emailVerified: users.emailVerified, banned: users.banned }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.emailVerified || user.banned) {
    throw new ReferralError(403, "account_not_eligible", "A verified account in good standing is required");
  }
}

/** Creates the caller's affiliate account after they accepted the current Affiliate Agreement version. */
export async function enrollAffiliate(db: AppDb, userId: string, input: { termsVersion: unknown }, now = new Date()): Promise<AffiliateRow> {
  const { rules } = await getActiveRules(db);
  if (input.termsVersion !== rules.termsVersion) {
    throw new ReferralError(422, "terms_not_accepted", `Accept the Affiliate Agreement version ${rules.termsVersion}`);
  }
  await assertEligibleUser(db, userId);
  try {
    const [row] = await db
      .insert(affiliates)
      .values({ userId, termsVersion: rules.termsVersion, termsAcceptedAt: now, createdAt: now, updatedAt: now })
      .returning();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ReferralError(409, "already_enrolled", "You already joined the affiliate program");
    throw error;
  }
}

/** Distinct referred buyers with a settled, non-reversed, non-held eligible purchase. */
export async function qualifyingCustomers(db: AppDb, affiliateId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${affiliateConversions.buyerUserId})` })
    .from(affiliateConversions)
    .where(and(eq(affiliateConversions.affiliateId, affiliateId), inArray(affiliateConversions.status, ["pending", "available"])));
  return Number(row?.count ?? 0);
}

export interface AffiliateStanding {
  rulesVersion: number;
  customers: number;
  level: ProgramLevel;
  next: { level: ProgramLevel; customersNeeded: number } | null;
  basis: AffiliateIncentiveBasis;
  budgetBps: number;
}

/**
 * Level and budget right now. The basis comes from the server-side effective-tier resolver: an active
 * Premium or VIP membership (including grace) uses the member budget. Rank is earned by customers, so a
 * lapsed membership keeps the level and only switches new checkouts to the ordinary budget.
 */
export async function affiliateStanding(db: AppDb, affiliate: Pick<AffiliateRow, "id" | "userId">, now = new Date(), active?: ActiveRules): Promise<AffiliateStanding> {
  const { version, rules } = active ?? (await getActiveRules(db));
  const [customers, tier] = await Promise.all([qualifyingCustomers(db, affiliate.id), getMemberTier(db, affiliate.userId, now)]);
  return standingFrom({ version, rules }, customers, tier);
}

function standingFrom({ version, rules }: ActiveRules, customers: number, tier: EffectiveTier): AffiliateStanding {
  const level = levelFor(rules, customers);
  const basis: AffiliateIncentiveBasis = tier.tier === "none" ? "ordinary" : "member";
  return { rulesVersion: version, customers, level, next: nextLevel(rules, customers), basis, budgetBps: budgetFor(level, basis) };
}

/** Ids per `IN (…)` list, under D1's limit of 100 bound parameters per statement. */
const ID_CHUNK = 90;

function chunks<T>(values: readonly T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < values.length; start += size) out.push(values.slice(start, start + size));
  return out;
}

/**
 * Standing of many affiliates with grouped queries (qualifying customers and linked subscriptions per
 * chunk of ids) instead of two queries per affiliate. Same result as `affiliateStanding` for each.
 */
export async function affiliateStandings(
  db: AppDb,
  rows: ReadonlyArray<Pick<AffiliateRow, "id" | "userId">>,
  now: Date,
  active: ActiveRules
): Promise<Map<string, AffiliateStanding>> {
  const customersById = new Map<string, number>();
  const subscriptionsByUser = new Map<string, Array<typeof subscriptions.$inferSelect>>();
  for (const group of chunks(rows)) {
    const [counts, linked] = await Promise.all([
      db
        .select({ affiliateId: affiliateConversions.affiliateId, count: sql<number>`count(distinct ${affiliateConversions.buyerUserId})` })
        .from(affiliateConversions)
        .where(and(inArray(affiliateConversions.affiliateId, group.map((row) => row.id)), inArray(affiliateConversions.status, ["pending", "available"])))
        .groupBy(affiliateConversions.affiliateId),
      db
        .select({ userId: customers.userId, subscription: subscriptions })
        .from(subscriptions)
        .innerJoin(customers, eq(customers.id, subscriptions.customerId))
        .where(inArray(customers.userId, group.map((row) => row.userId))),
    ]);
    for (const row of counts) customersById.set(row.affiliateId, Number(row.count));
    for (const row of linked) {
      if (!row.userId) continue;
      const list = subscriptionsByUser.get(row.userId) ?? [];
      list.push(row.subscription);
      subscriptionsByUser.set(row.userId, list);
    }
  }
  const graceDays = getPastDueGraceDays();
  const result = new Map<string, AffiliateStanding>();
  for (const row of rows) {
    const tier = resolveEffectiveTier((subscriptionsByUser.get(row.userId) ?? []).map(toMembershipState), now, graceDays);
    result.set(row.id, standingFrom(active, customersById.get(row.id) ?? 0, tier));
  }
  return result;
}

/** Operator list of affiliate accounts, newest first, optionally filtered by status. */
export async function listAffiliates(db: AppDb, input: { status?: AffiliateStatus; limit?: number } = {}): Promise<AffiliateRow[]> {
  return db
    .select()
    .from(affiliates)
    .where(input.status ? eq(affiliates.status, input.status) : undefined)
    .orderBy(desc(affiliates.createdAt))
    .limit(input.limit ?? 50);
}

/**
 * Operator: suspend an active affiliate (new checkouts stop attributing, payouts are blocked) or
 * reinstate a suspended one. One guarded update, so a concurrent change is a 409, never a silent overwrite.
 */
export async function setAffiliateStatus(
  db: AppDb,
  affiliateId: string,
  input: { status: AffiliateStatus; reason: string },
  now = new Date()
): Promise<AffiliateRow> {
  const from: AffiliateStatus = input.status === "suspended" ? "active" : "suspended";
  const [row] = await db
    .update(affiliates)
    .set({ status: input.status, suspendedReason: input.status === "suspended" ? input.reason : null, updatedAt: now })
    .where(and(eq(affiliates.id, affiliateId), eq(affiliates.status, from)))
    .returning();
  if (row) return row;
  if (!(await findAffiliateById(db, affiliateId))) throw new ReferralError(404, "not_found", "Affiliate not found");
  throw new ReferralError(409, "invalid_transition", input.status === "suspended" ? "Only active affiliates can be suspended" : "Only suspended affiliates can be reinstated");
}
