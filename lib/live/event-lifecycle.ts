import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { liveEvents } from "@/lib/db/schema";
import type { LiveEventStatus } from "./types";
import { LiveError, liveNotFound } from "./live-errors";

/**
 * Event state machine (docs/live-and-access-adr.md, "Live events and seats"):
 * `draft → scheduled → sales_open → live → ended → archived`, plus `cancelled` from `draft`,
 * `scheduled`, `sales_open` or `live`. Every other transition, including staying put, is refused.
 */
export const LIVE_EVENT_TRANSITIONS: Readonly<Record<LiveEventStatus, readonly LiveEventStatus[]>> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["sales_open", "cancelled"],
  sales_open: ["live", "cancelled"],
  live: ["ended", "cancelled"],
  ended: ["archived"],
  cancelled: [],
  archived: [],
};

/** Statuses anyone may read. Drafts are operator-only. */
export const PUBLIC_EVENT_STATUSES: readonly LiveEventStatus[] = ["scheduled", "sales_open", "live", "ended", "cancelled", "archived"];

export function isPublicEventStatus(status: LiveEventStatus): boolean {
  return PUBLIC_EVENT_STATUSES.includes(status);
}

export function canTransition(from: LiveEventStatus, to: LiveEventStatus): boolean {
  return LIVE_EVENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: LiveEventStatus, to: LiveEventStatus): void {
  if (!canTransition(from, to)) {
    throw new LiveError(409, "invalid_transition", `Cannot move an event from ${from} to ${to}`);
  }
}

/**
 * Transitions that only change `status`. Opening sales (seat rows) and cancelling (revocations) have
 * side effects and go through `openSales` / `cancelEvent` instead.
 */
export type SimpleEventTransition = "scheduled" | "live" | "ended" | "archived";

/**
 * Move an event along the state machine with a compare-and-set UPDATE (`WHERE status = from`), so two
 * concurrent operators cannot both apply a transition from the same state.
 */
export async function transitionEvent(
  eventId: string,
  to: SimpleEventTransition,
  db: AppDb,
  now: Date = new Date()
): Promise<typeof liveEvents.$inferSelect> {
  if (!["scheduled", "live", "ended", "archived"].includes(to)) {
    throw new LiveError(409, "invalid_transition", `Use the dedicated operation to move an event to ${to}`);
  }
  const [event] = await db.select().from(liveEvents).where(eq(liveEvents.id, eventId)).limit(1);
  if (!event) throw liveNotFound("Event");
  assertTransition(event.status, to);
  const [row] = await db
    .update(liveEvents)
    .set({ status: to, updatedAt: now })
    .where(and(eq(liveEvents.id, eventId), eq(liveEvents.status, event.status)))
    .returning();
  if (!row) throw new LiveError(409, "conflict", "The event changed while updating; retry");
  return row;
}
