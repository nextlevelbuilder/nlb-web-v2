import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";

/** How long one delivery may hold an event before another delivery may take it over. */
export const WEBHOOK_LOCK_LEASE_MS = 5 * 60 * 1000;

export type WebhookClaimResult = "claimed" | "duplicate" | "locked";

/**
 * Claim a webhook event for processing.
 * - First delivery: the unique `event_id` insert claims it with a lease.
 * - Redelivery: a single conditional UPDATE takes the lease only when it is free
 *   (`locked_until` null, released after a failure) or expired, and only one concurrent caller can
 *   change that row; `changes` tells whether this caller won.
 */
export async function claimWebhookEvent(
  db: AppDb,
  event: { eventId: string; eventType: string; payload: unknown },
  now: Date = new Date()
): Promise<WebhookClaimResult> {
  const lockedUntil = new Date(now.getTime() + WEBHOOK_LOCK_LEASE_MS);
  const inserted = await db
    .insert(webhookEvents)
    .values({ eventId: event.eventId, eventType: event.eventType, payload: event.payload, processed: false, lockedUntil })
    .onConflictDoNothing({ target: webhookEvents.eventId })
    .run();
  if (inserted.meta.changes === 1) return "claimed";

  const reclaimed = await db
    .update(webhookEvents)
    .set({ lockedUntil, processedAt: now })
    .where(
      and(
        eq(webhookEvents.eventId, event.eventId),
        eq(webhookEvents.processed, false),
        or(isNull(webhookEvents.lockedUntil), lt(webhookEvents.lockedUntil, now))
      )
    )
    .run();
  if (reclaimed.meta.changes === 1) return "claimed";

  const [existing] = await db
    .select({ processed: webhookEvents.processed })
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, event.eventId))
    .limit(1);
  return existing?.processed ? "duplicate" : "locked";
}

/** Mark the event done and drop the lease. */
export async function completeWebhookEvent(db: AppDb, eventId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ processed: true, processedAt: now, error: null, lockedUntil: null })
    .where(eq(webhookEvents.eventId, eventId));
}

/** Record a failure and release the lease so Polar's retry can claim the event at once. */
export async function failWebhookEvent(db: AppDb, eventId: string, message: string, now: Date = new Date()): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ error: message, processedAt: now, lockedUntil: null })
    .where(eq(webhookEvents.eventId, eventId));
}
