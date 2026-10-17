import { and, eq, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { customers, orders, subscriptions, users } from "@/lib/db/schema";
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
 * Link a Polar customer to an NLB user. Never steals: a customer already owned by another user is
 * left unchanged. One user may own several customers (a Polar customer per checkout email).
 * Returns true when the customer is linked to `userId` after the call.
 */
export async function linkCustomerToUser(
  db: AppDb,
  { customerId, userId }: { customerId: string; userId: string }
): Promise<boolean> {
  await db
    .update(customers)
    .set({ userId, updatedAt: new Date() })
    .where(and(eq(customers.id, customerId), isNull(customers.userId)));
  const [row] = await db.select({ userId: customers.userId }).from(customers).where(eq(customers.id, customerId)).limit(1);
  return row?.userId === userId;
}

/** Polar ids that belong to the purchase being processed (one checkout, its subscription and order). */
export interface PurchaseRefs {
  polarSubscriptionIds?: readonly (string | null | undefined)[];
  polarOrderIds?: readonly (string | null | undefined)[];
}

const presentIds = (ids: readonly (string | null | undefined)[] | undefined): string[] =>
  (ids ?? []).filter((id): id is string => typeof id === "string" && id.length > 0);

/** Whether the customer has any subscription or order recorded besides the ones of this purchase. */
async function hasOtherPurchases(db: AppDb, customerId: string, refs: PurchaseRefs): Promise<boolean> {
  const subscriptionIds = presentIds(refs.polarSubscriptionIds);
  const orderIds = presentIds(refs.polarOrderIds);
  const otherSubscription: SQL[] = [eq(subscriptions.customerId, customerId)];
  if (subscriptionIds.length > 0) otherSubscription.push(notInArray(subscriptions.polarSubscriptionId, subscriptionIds));
  const [subscription] = await db.select({ id: subscriptions.id }).from(subscriptions).where(and(...otherSubscription)).limit(1);
  if (subscription) return true;
  const otherOrder: SQL[] = [eq(orders.customerId, customerId)];
  if (orderIds.length > 0) otherOrder.push(notInArray(orders.polarOrderId, orderIds));
  const [order] = await db.select({ id: orders.id }).from(orders).where(and(...otherOrder)).limit(1);
  return Boolean(order);
}

/**
 * Whether `metadata.nlb_user_id` may link this customer. The metadata is server-set, but the checkout
 * email is only a prefill the buyer can edit on Polar's page, so the metadata proves who paid for this
 * purchase, not who owns the customer. Ownership is enforced here, at link time:
 * - when the customer email is another user's verified email, that user owns it, never the payer;
 * - otherwise it is trusted when the email equals the payer's verified email (trim + lowercase) or
 *   the customer is new to us (nothing recorded besides this purchase).
 */
export async function canLinkFromMetadata(
  db: AppDb,
  customer: { id: string; email: string },
  userId: string,
  refs: PurchaseRefs
): Promise<boolean> {
  const [user] = await db
    .select({ email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return false;
  if (user.emailVerified && user.email && normalizeEmail(user.email) === normalizeEmail(customer.email)) return true;
  const emailOwner = await findVerifiedUserIdByEmail(db, customer.email);
  if (emailOwner && emailOwner !== userId) return false;
  return !(await hasOtherPurchases(db, customer.id, refs));
}

/**
 * Link the customer of a purchase from server-trusted signals only: `metadata.nlb_user_id` under the
 * rule of `canLinkFromMetadata`, else the NLB user whose verified email equals the customer email.
 * Never overwrites an existing link. Returns the user the customer is linked to afterwards, if any.
 */
export async function linkCustomerFromPurchase(
  db: AppDb,
  customer: { id: string; email: string; userId?: string | null },
  { metadataUserId, refs }: { metadataUserId?: string | null; refs: PurchaseRefs }
): Promise<string | null> {
  if (customer.userId) return customer.userId;
  if (metadataUserId && (await canLinkFromMetadata(db, customer, metadataUserId, refs))) {
    if (await linkCustomerToUser(db, { customerId: customer.id, userId: metadataUserId })) return metadataUserId;
    return currentOwner(db, customer.id);
  }
  const verifiedUserId = await findVerifiedUserIdByEmail(db, customer.email);
  if (!verifiedUserId) return null;
  if (await linkCustomerToUser(db, { customerId: customer.id, userId: verifiedUserId })) return verifiedUserId;
  return currentOwner(db, customer.id);
}

async function currentOwner(db: AppDb, customerId: string): Promise<string | null> {
  const [row] = await db.select({ userId: customers.userId }).from(customers).where(eq(customers.id, customerId)).limit(1);
  return row?.userId ?? null;
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
