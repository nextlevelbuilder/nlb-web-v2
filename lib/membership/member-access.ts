import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { customers, subscriptions, users } from "@/lib/db/schema";
import { getPastDueGraceDays } from "@/lib/onboarding/flags";
import { resolveEffectiveTier, type EffectiveTier, type MembershipSubscriptionState } from "./effective-tier";
import { tierForProductId } from "./tiers";

type CustomerRow = typeof customers.$inferSelect;
type SubscriptionRow = typeof subscriptions.$inferSelect;

/** SQLite unique-constraint failure, also when Drizzle wraps the driver error in `cause`. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error && /UNIQUE constraint failed/i.test(current.message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

/** Emails are compared trimmed and lowercased only; plus-aliases and dots are never merged. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toMembershipState(row: SubscriptionRow): MembershipSubscriptionState {
  return {
    tier: tierForProductId(row.polarProductId),
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
    pastDueSince: row.pastDueSince ?? null,
    endedAt: row.endedAt ?? null,
  };
}

/** Subscriptions of the Polar customer linked to `userId` (empty when the user never linked). */
export async function getLinkedSubscriptions(db: AppDb, userId: string): Promise<SubscriptionRow[]> {
  const rows = await db
    .select({ subscription: subscriptions })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(eq(customers.userId, userId));
  return rows.map((row) => row.subscription);
}

/**
 * Effective membership tier of a user. Only a customer row linked through NLB (`customers.user_id`)
 * counts, so a user who never linked is never granted (or revoked) anything.
 */
export async function getMemberTier(db: AppDb, userId: string, now: Date = new Date()): Promise<EffectiveTier> {
  const rows = await getLinkedSubscriptions(db, userId);
  return resolveEffectiveTier(rows.map(toMembershipState), now, getPastDueGraceDays());
}

/**
 * Link a Polar customer to an NLB user. Never steals: a customer already owned by another user, or
 * a user who already owns another customer, is left unchanged. Returns true when the customer is
 * linked to `userId` after the call.
 */
export async function linkCustomerToUser(
  db: AppDb,
  { customerId, userId }: { customerId: string; userId: string }
): Promise<boolean> {
  try {
    await db
      .update(customers)
      .set({ userId, updatedAt: new Date() })
      .where(and(eq(customers.id, customerId), isNull(customers.userId)));
  } catch (error) {
    // Unique `customers.user_id`: this user already owns a different customer row.
    if (!isUniqueViolation(error)) throw error;
  }
  const [row] = await db.select({ userId: customers.userId }).from(customers).where(eq(customers.id, customerId)).limit(1);
  return row?.userId === userId;
}

/**
 * The customer a user may claim by email: only when the user's email is verified and equals the
 * customer's email after trim and lowercase, and the customer is unlinked or already theirs.
 */
export async function findLinkableCustomerForUser(
  db: AppDb,
  user: { id: string; email: string; emailVerified: boolean | null }
): Promise<CustomerRow | null> {
  if (!user.emailVerified || !user.email) return null;
  const [row] = await db
    .select()
    .from(customers)
    .where(
      and(
        sql`lower(trim(${customers.email})) = ${normalizeEmail(user.email)}`,
        or(isNull(customers.userId), eq(customers.userId, user.id))
      )
    )
    .limit(1);
  return row ?? null;
}

/** The NLB user with this exact verified email (trim + lowercase), if any. */
export async function findVerifiedUserIdByEmail(db: AppDb, email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(trim(${users.email})) = ${normalizeEmail(email)}`, eq(users.emailVerified, true)))
    .limit(1);
  return row?.id ?? null;
}

export async function userExists(db: AppDb, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(row);
}
