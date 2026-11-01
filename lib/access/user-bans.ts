/**
 * Banning and unbanning accounts. A ban is the `users.banned` / `ban_reason` / `ban_expires` columns
 * Better Auth's admin plugin also writes, so every credential (session, API key, MCP delegation) and
 * `authorize()` refuse the account at the next check (`isBanActive`). Banning also ends the account's
 * open sessions, so a browser does not stay signed in until its session expires.
 */
import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

export interface BanInput {
  userId: string;
  reason: string;
  /** Null for a ban without an end. */
  expiresAt: Date | null;
  now: Date;
}

/** Bans the account and deletes its sessions in one batch. Returns false when the user does not exist. */
export async function banUser(db: AppDb, input: BanInput): Promise<boolean> {
  const [updated] = await db.batch([
    db
      .update(users)
      .set({ banned: true, banReason: input.reason, banExpires: input.expiresAt, updatedAt: input.now })
      .where(eq(users.id, input.userId))
      .returning({ id: users.id }),
    db.delete(sessions).where(eq(sessions.userId, input.userId)),
  ]);
  return updated.length > 0;
}

/** Lifts a ban. Returns false when the user does not exist. */
export async function unbanUser(db: AppDb, userId: string, now: Date): Promise<boolean> {
  const updated = await db
    .update(users)
    .set({ banned: false, banReason: null, banExpires: null, updatedAt: now })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return updated.length > 0;
}
