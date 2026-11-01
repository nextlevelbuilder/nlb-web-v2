/**
 * Read models behind the account operator routes (`/api/v1/operator/users`, `/membership`, `/commerce`).
 * Writes never happen here: bans, grants and refunds go through their domain services.
 */
import { and, desc, eq, isNotNull, like, or, sql, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { customers, entitlements, members, orders, organizations, subscriptions, users, webhookEvents } from "@/lib/db/schema";

/** Escapes LIKE wildcards so a search term matches literally. */
const likePrefix = (term: string) => `${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  emailVerified: users.emailVerified,
  role: users.role,
  banned: users.banned,
  banReason: users.banReason,
  banExpires: users.banExpires,
  createdAt: users.createdAt,
};

/** Users whose id equals, or email or name starts with, `q`; newest first. */
export function searchUsers(db: AppDb, filter: { q: string | null; limit: number }) {
  const term = filter.q?.toLowerCase();
  const where = term
    ? or(eq(users.id, filter.q!), sql`lower(${users.email}) like ${likePrefix(term)} escape '\\'`, sql`lower(${users.name}) like ${likePrefix(term)} escape '\\'`)
    : undefined;
  return db.select(userColumns).from(users).where(where).orderBy(desc(users.createdAt)).limit(filter.limit);
}

export async function getUser(db: AppDb, userId: string) {
  const [row] = await db.select(userColumns).from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

/** Organizations whose slug or name starts with `q`. */
export function searchOrganizations(db: AppDb, filter: { q: string | null; limit: number }) {
  const where = filter.q ? or(like(organizations.slug, likePrefix(filter.q)), like(organizations.name, likePrefix(filter.q))) : undefined;
  return db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, createdAt: organizations.createdAt })
    .from(organizations)
    .where(where)
    .orderBy(desc(organizations.createdAt))
    .limit(filter.limit);
}

export async function getOrganization(db: AppDb, orgId: string) {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, createdAt: organizations.createdAt })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return null;
  const roster = await db
    .select({ userId: members.userId, role: members.role, name: users.name, email: users.email })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, orgId))
    .orderBy(users.name);
  return { ...org, members: roster };
}

/** Organizations a user belongs to, with the member's role. */
export function listUserOrganizations(db: AppDb, userId: string) {
  return db
    .select({ orgId: organizations.id, name: organizations.name, slug: organizations.slug, role: members.role })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(eq(members.userId, userId))
    .orderBy(organizations.name);
}

const orderColumns = {
  id: orders.id,
  polarOrderId: orders.polarOrderId,
  polarProductId: orders.polarProductId,
  productName: orders.productName,
  productSlug: orders.productSlug,
  amount: orders.amount,
  currency: orders.currency,
  status: orders.status,
  paidAt: orders.paidAt,
  createdAt: orders.createdAt,
  customerEmail: customers.email,
  customerUserId: customers.userId,
};

/** Stored Polar orders, newest first: by linked user or status. */
export function listOrders(db: AppDb, filter: { userId: string | null; status: string | null; limit: number }) {
  const where: SQL[] = [];
  if (filter.userId) where.push(eq(customers.userId, filter.userId));
  if (filter.status) where.push(eq(orders.status, filter.status));
  return db
    .select(orderColumns)
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(filter.limit);
}

export async function getOrder(db: AppDb, orderId: string) {
  const [row] = await db.select({ order: orders, customerEmail: customers.email, customerUserId: customers.userId }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(eq(orders.id, orderId)).limit(1);
  return row ?? null;
}

const subscriptionColumns = {
  id: subscriptions.id,
  polarSubscriptionId: subscriptions.polarSubscriptionId,
  polarProductId: subscriptions.polarProductId,
  productName: subscriptions.productName,
  status: subscriptions.status,
  currentPeriodStart: subscriptions.currentPeriodStart,
  currentPeriodEnd: subscriptions.currentPeriodEnd,
  cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
  pastDueSince: subscriptions.pastDueSince,
  endedAt: subscriptions.endedAt,
  createdAt: subscriptions.createdAt,
  updatedAt: subscriptions.updatedAt,
  customerId: subscriptions.customerId,
  customerUserId: customers.userId,
};

/** Stored Polar subscriptions, newest first: by linked user, customer or status. */
export function listSubscriptions(db: AppDb, filter: { userId: string | null; customerId: string | null; status: string | null; limit: number }) {
  const where: SQL[] = [];
  if (filter.userId) where.push(eq(customers.userId, filter.userId));
  if (filter.customerId) where.push(eq(subscriptions.customerId, filter.customerId));
  if (filter.status) where.push(eq(subscriptions.status, filter.status));
  return db
    .select(subscriptionColumns)
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(subscriptions.createdAt))
    .limit(filter.limit);
}

export async function getSubscription(db: AppDb, subscriptionId: string) {
  const [row] = await db
    .select({ subscription: subscriptions, customerUserId: customers.userId })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);
  return row ?? null;
}

const customerColumns = {
  id: customers.id,
  email: customers.email,
  name: customers.name,
  polarCustomerId: customers.polarCustomerId,
  userId: customers.userId,
  createdAt: customers.createdAt,
};

/** Polar customers, newest first: by linked user only, so no email ever travels in a URL. */
export function listCustomers(db: AppDb, filter: { userId: string | null; limit: number }) {
  return db
    .select(customerColumns)
    .from(customers)
    .where(filter.userId ? eq(customers.userId, filter.userId) : undefined)
    .orderBy(desc(customers.createdAt))
    .limit(filter.limit);
}

/** One customer with their stored orders and subscriptions. */
export async function getCustomer(db: AppDb, customerId: string) {
  const [customer] = await db.select(customerColumns).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return null;
  const [customerOrders, customerSubscriptions] = await Promise.all([
    db.select(orderColumns).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt)).limit(100),
    listSubscriptions(db, { userId: null, customerId, status: null, limit: 100 }),
  ]);
  return { ...customer, orders: customerOrders, subscriptions: customerSubscriptions };
}

/** Entitlements written by purchases, newest first: by user, feature key, and active only unless `all`. */
export function listEntitlements(db: AppDb, filter: { userId: string | null; featureKey: string | null; all: boolean; limit: number }) {
  const where: SQL[] = [];
  if (filter.userId) where.push(eq(entitlements.userId, filter.userId));
  if (filter.featureKey) where.push(eq(entitlements.featureKey, filter.featureKey));
  if (!filter.all) where.push(eq(entitlements.isActive, true));
  return db
    .select()
    .from(entitlements)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(entitlements.createdAt))
    .limit(filter.limit);
}

/**
 * Polar webhook deliveries that failed (`error` set) or are not processed yet, newest first. The
 * payload is never returned: it carries customer personal data.
 */
export function listWebhookEvents(db: AppDb, filter: { status: "failed" | "pending"; limit: number }) {
  const where = filter.status === "failed" ? isNotNull(webhookEvents.error) : eq(webhookEvents.processed, false);
  return db
    .select({
      id: webhookEvents.id,
      eventId: webhookEvents.eventId,
      eventType: webhookEvents.eventType,
      processed: webhookEvents.processed,
      processedAt: webhookEvents.processedAt,
      error: webhookEvents.error,
      lockedUntil: webhookEvents.lockedUntil,
      createdAt: webhookEvents.createdAt,
    })
    .from(webhookEvents)
    .where(where)
    .orderBy(desc(webhookEvents.createdAt))
    .limit(filter.limit);
}
