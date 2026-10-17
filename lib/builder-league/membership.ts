/**
 * The only adapter between the Builder League and community membership / identity. Membership comes
 * from commerce (Polar subscriptions linked through `customers.user_id`), never from Better Auth
 * organization membership, and it never changes RP, rank or League Score: it only gates access.
 * This module only reads the onboarding tables; it never writes them.
 */
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { communityConnections } from "@/lib/db/schema";
import { getMemberTier } from "@/lib/membership/member-access";
import type { CommunityTier } from "./types";

/** Community tier of a user: VIP wins over Premium; "none" without an effective paid membership. */
export async function getCommunityTier(db: AppDb, userId: string, now: Date = new Date()): Promise<CommunityTier> {
  const { tier } = await getMemberTier(db, userId, now);
  return tier;
}

export interface DiscordIdentity {
  externalUserId: string;
  username: string | null;
  linkedAt: Date;
}

/** Discord account linked to the user through onboarding, or null. */
export async function getDiscordIdentity(db: AppDb, userId: string): Promise<DiscordIdentity | null> {
  const [row] = await db
    .select({
      externalUserId: communityConnections.externalUserId,
      username: communityConnections.displayName,
      linkedAt: communityConnections.linkedAt,
    })
    .from(communityConnections)
    .where(and(eq(communityConnections.userId, userId), eq(communityConnections.provider, "discord")))
    .limit(1);
  return row ?? null;
}
