import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { entitlements, liveTickets, users } from "@/lib/db/schema";

/**
 * Fresh facts `authorize()` reads on every call. Nothing here is cached, so a ban, refund, revoked
 * entitlement or ended ticket takes effect at the next check.
 */

export interface SubjectUserFacts {
  emailVerified: boolean;
  banned: boolean;
}

/** Identity facts for a user, or null when the user does not exist. A ban counts until `ban_expires`. */
export async function loadUserFacts(db: AppDb, userId: string, now: Date): Promise<SubjectUserFacts | null> {
  const [row] = await db
    .select({ emailVerified: users.emailVerified, banned: users.banned, banExpires: users.banExpires })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  const banned = Boolean(row.banned) && (!row.banExpires || row.banExpires.getTime() > now.getTime());
  return { emailVerified: row.emailVerified === true, banned };
}

/** True when the user holds an active, unexpired entitlement for `featureKey`. */
export async function hasActiveEntitlement(db: AppDb, userId: string, featureKey: string, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.featureKey, featureKey),
        eq(entitlements.isActive, true),
        or(isNull(entitlements.validUntil), gt(entitlements.validUntil, now))
      )
    )
    .limit(1);
  return Boolean(row);
}

/** True when the user owns an `active` ticket row for the event (refunded/cancelled/exception do not count). */
export async function hasActiveLiveTicket(db: AppDb, userId: string, eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: liveTickets.id })
    .from(liveTickets)
    .where(and(eq(liveTickets.eventId, eventId), eq(liveTickets.userId, userId), eq(liveTickets.status, "active")))
    .limit(1);
  return Boolean(row);
}
