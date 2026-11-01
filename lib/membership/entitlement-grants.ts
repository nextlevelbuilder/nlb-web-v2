/**
 * Manual entitlements granted by operators (`entitlement_grants`). They unlock exactly what a purchased
 * entitlement with the same feature key unlocks (see `hasActiveEntitlement`), but live in their own
 * table: no order, purchase or `entitlements` row is written, so a manual grant never looks like a
 * Polar payment and refunds and grants never cancel each other.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { entitlementGrants, entitlements } from "@/lib/db/schema";

/** Feature keys an operator may grant: one Courses video or one Live replay. */
export const GRANTABLE_FEATURE_KEY = /^(video|live:replay):[A-Za-z0-9_-]{1,100}$/;

export type EntitlementGrantRow = typeof entitlementGrants.$inferSelect;

export interface GrantInput {
  userId: string;
  featureKey: string;
  reason: string;
  validUntil: Date | null;
  grantedBy: string;
  approvalId: string;
}

/** Records a grant; returns null when the user already holds a live grant for the key. */
export async function grantEntitlement(db: AppDb, input: GrantInput): Promise<EntitlementGrantRow | null> {
  const [row] = await db.insert(entitlementGrants).values(input).onConflictDoNothing().returning();
  return row ?? null;
}

export async function getEntitlementGrant(db: AppDb, grantId: string): Promise<EntitlementGrantRow | null> {
  const [row] = await db.select().from(entitlementGrants).where(eq(entitlementGrants.id, grantId)).limit(1);
  return row ?? null;
}

/** Revokes a live grant; returns null when it is missing or already revoked. History is kept. */
export async function revokeEntitlementGrant(db: AppDb, input: { grantId: string; revokedBy: string; now: Date }): Promise<EntitlementGrantRow | null> {
  const [row] = await db
    .update(entitlementGrants)
    .set({ revokedAt: input.now, revokedBy: input.revokedBy })
    .where(and(eq(entitlementGrants.id, input.grantId), isNull(entitlementGrants.revokedAt)))
    .returning();
  return row ?? null;
}

/** Every grant of a user, newest first, revoked ones included. */
export function listUserGrants(db: AppDb, userId: string): Promise<EntitlementGrantRow[]> {
  return db.select().from(entitlementGrants).where(eq(entitlementGrants.userId, userId)).orderBy(desc(entitlementGrants.createdAt));
}

/** Entitlements written by purchases for a user. */
export function listPurchasedEntitlements(db: AppDb, userId: string) {
  return db
    .select({
      featureKey: entitlements.featureKey,
      isActive: entitlements.isActive,
      validFrom: entitlements.validFrom,
      validUntil: entitlements.validUntil,
    })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .orderBy(desc(entitlements.createdAt));
}
