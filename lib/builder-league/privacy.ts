import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { builderPrivacy } from "@/lib/db/schema";
import type { PrivacySurface } from "./types";

export type BuilderPrivacy = typeof builderPrivacy.$inferSelect;

export type PrivacyPatch = Partial<
  Pick<
    BuilderPrivacy,
    "leaderboardPublic" | "passportPublic" | "wrappedPublic" | "peerMentionsOk" | "backfillOptIn" | "redactFinancials"
  >
>;

/** Private by default: every public surface is opt-in and financial details are redacted. */
export function defaultPrivacy(userId: string): BuilderPrivacy {
  return {
    userId,
    leaderboardPublic: false,
    passportPublic: false,
    wrappedPublic: false,
    peerMentionsOk: false,
    backfillOptIn: false,
    redactFinancials: true,
    updatedAt: new Date(0),
  };
}

export async function getPrivacy(db: AppDb, userId: string): Promise<BuilderPrivacy> {
  const [row] = await db.select().from(builderPrivacy).where(eq(builderPrivacy.userId, userId)).limit(1);
  return row ?? defaultPrivacy(userId);
}

/** Upserts the given switches; unspecified switches keep their current (or default) value. */
export async function updatePrivacy(db: AppDb, userId: string, patch: PrivacyPatch): Promise<BuilderPrivacy> {
  const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => typeof value === "boolean")) as PrivacyPatch;
  const now = new Date();
  const [row] = await db
    .insert(builderPrivacy)
    .values({ ...defaultPrivacy(userId), ...changes, updatedAt: now })
    .onConflictDoUpdate({ target: builderPrivacy.userId, set: { ...changes, updatedAt: now } })
    .returning();
  return row;
}

/** True only when the member opted in to the given public surface. */
export function isPublic(privacy: Pick<BuilderPrivacy, "leaderboardPublic" | "passportPublic" | "wrappedPublic" | "peerMentionsOk"> | null | undefined, surface: PrivacySurface): boolean {
  if (!privacy) return false;
  switch (surface) {
    case "leaderboard":
      return privacy.leaderboardPublic;
    case "passport":
      return privacy.passportPublic;
    case "wrapped":
      return privacy.wrappedPublic;
    case "peer_mentions":
      return privacy.peerMentionsOk;
  }
}
