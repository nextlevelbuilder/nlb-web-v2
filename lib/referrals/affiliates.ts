import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { affiliateConversions, affiliates, users } from "@/lib/db/schema";
import { getMemberTier } from "@/lib/membership/member-access";
import { isUniqueViolation } from "@/lib/membership/member-access";
import { budgetFor, levelFor, nextLevel } from "./program-math";
import { getActiveRules, type ActiveRules } from "./program-rules";
import { ReferralError } from "./referral-errors";
import type { AffiliateIncentiveBasis, ProgramLevel } from "./types";

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
  const level = levelFor(rules, customers);
  const basis: AffiliateIncentiveBasis = tier.tier === "none" ? "ordinary" : "member";
  return { rulesVersion: version, customers, level, next: nextLevel(rules, customers), basis, budgetBps: budgetFor(level, basis) };
}
