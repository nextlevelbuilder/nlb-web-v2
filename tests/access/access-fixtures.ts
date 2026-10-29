import type { AppDb } from "@/lib/db";
import { customers, entitlements, liveEvents, liveTickets, subscriptions, users } from "@/lib/db/schema";
import type { AccessSubject } from "@/lib/access/types";
import type { LiveTicketStatus } from "@/lib/live/types";

/** Shared seeding helpers for access and operator tests (real local D1). */

export const DAY = 86_400_000;

/** Polar product ids the tests mock `@/lib/polar` with. */
export const TEST_PLAN_PRODUCTS = { premium: ["prod_premium"], vip: ["prod_vip"] } as const;

export function session(userId: string): AccessSubject {
  return { userId, authType: "session" };
}

export function apiKey(userId: string, scopes: readonly string[] = ["api:read", "api:write"]): AccessSubject {
  return { userId, authType: "api_key", scopes };
}

export function delegation(userId: string, scopes: readonly string[]): AccessSubject {
  return { userId, authType: "delegation", scopes, clientId: "client_test" };
}

export interface UserSeed {
  id: string;
  emailVerified?: boolean;
  banned?: boolean;
  banExpires?: Date | null;
}

export async function seedUsers(db: AppDb, seeds: UserSeed[]): Promise<void> {
  await db.insert(users).values(
    seeds.map((seed) => ({
      id: seed.id,
      name: seed.id,
      email: `${seed.id}@example.com`,
      emailVerified: seed.emailVerified ?? true,
      banned: seed.banned ?? false,
      banExpires: seed.banExpires ?? null,
    }))
  );
}

export async function seedSubscription(db: AppDb, userId: string, productId: string, status = "active"): Promise<void> {
  const customerId = crypto.randomUUID();
  await db.insert(customers).values({ id: customerId, email: `${userId}@example.com`, userId });
  await db.insert(subscriptions).values({
    customerId,
    polarSubscriptionId: `sub_${userId}_${productId}`,
    polarProductId: productId,
    productName: productId,
    status,
    currentPeriodEnd: new Date(Date.now() + 30 * DAY),
  });
}

export async function seedEntitlement(db: AppDb, userId: string, featureKey: string, isActive = true): Promise<void> {
  await db.insert(entitlements).values({ userId, featureKey, isActive });
}

export async function seedLiveEvent(db: AppDb, id: string): Promise<void> {
  const startsAt = new Date(Date.now() + 7 * DAY);
  await db.insert(liveEvents).values({
    id,
    slug: id,
    titleEn: id,
    titleVi: id,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
    hostName: "Host",
    capacity: 10,
    priceCents: 1000,
    status: "sales_open",
    createdBy: "operator",
  });
}

export async function seedTicket(db: AppDb, eventId: string, userId: string, status: LiveTicketStatus): Promise<void> {
  await db.insert(liveTickets).values({ eventId, userId, status, polarOrderId: `order_${eventId}_${userId}_${status}` });
}
