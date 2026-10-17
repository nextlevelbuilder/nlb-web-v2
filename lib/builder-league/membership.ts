/**
 * The only adapter between the Builder League and community membership / identity. Membership comes
 * from commerce (Polar subscriptions), never from Better Auth organization membership, and it never
 * changes RP, rank or League Score: it only gates access.
 *
 * The onboarding work (issue #2) provides `getMemberTier(db, userId, now?)` in
 * `lib/membership/member-access.ts` and the `community_connections` table. When it lands, only this
 * file changes.
 */
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { customers, subscriptions, users } from "@/lib/db/schema";
import { MEMBERSHIP_PLAN_PRODUCT_IDS } from "@/lib/polar";
import type { CommunityTier } from "./types";

const ACTIVE_STATUSES = ["active", "trialing"];

/**
 * Community tier of a user: VIP wins over Premium; "none" without an active paid period.
 * Subscriptions are linked through the customer email, which must match a verified account email.
 */
// TODO(rebase #2): replace the body with `return getMemberTier(db, userId, now)` from
// `@/lib/membership/member-access` once the onboarding branch is merged.
export async function getCommunityTier(db: AppDb, userId: string, now: Date = new Date()): Promise<CommunityTier> {
  const [user] = await db
    .select({ email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const email = user?.email.trim().toLowerCase();
  if (!email || !user.emailVerified) return "none";

  // Unset product env vars must never match a subscription.
  const productIds = [...MEMBERSHIP_PLAN_PRODUCT_IDS.premium, ...MEMBERSHIP_PLAN_PRODUCT_IDS.vip].filter(Boolean);
  if (productIds.length === 0) return "none";
  const rows = await db
    .select({ productId: subscriptions.polarProductId })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        sql`lower(${customers.email}) = ${email}`,
        inArray(subscriptions.status, ACTIVE_STATUSES),
        inArray(subscriptions.polarProductId, productIds),
        or(isNull(subscriptions.currentPeriodEnd), gt(subscriptions.currentPeriodEnd, now))
      )
    );
  if (rows.some((row) => MEMBERSHIP_PLAN_PRODUCT_IDS.vip.includes(row.productId))) return "vip";
  if (rows.some((row) => MEMBERSHIP_PLAN_PRODUCT_IDS.premium.includes(row.productId))) return "premium";
  return "none";
}

export interface DiscordIdentity {
  externalUserId: string;
  username: string | null;
  linkedAt: Date;
}

/** Verified Discord account linked to the user, or null. */
// TODO(rebase #2): read `community_connections` (provider = 'discord', external_user_id) once the
// onboarding branch is merged. Until then no Discord identity is linked, so Discord events cannot be
// attributed to a member.
export async function getDiscordIdentity(_db: AppDb, _userId: string): Promise<DiscordIdentity | null> {
  return null;
}
