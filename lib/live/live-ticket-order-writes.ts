import { eq, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { liveTickets } from "@/lib/db/schema";
import { liveTicketFeatureKey } from "./types";
import { changesOf, runRawBatch } from "./live-d1-batch";

/**
 * The D1 batches behind `syncLiveTicketFromOrder` (see that module for the rules). Every statement
 * re-checks its preconditions in SQL (`WHERE EXISTS …`), so a batch that races another delivery
 * writes nothing it should not; the unique `polar_order_id` makes the ticket insert the gate.
 */
export type LiveTicketSyncOutcome = "ignored" | "duplicate" | "ticketed" | "exception" | "refunded";

export interface SyncCtx {
  db: AppDb;
  eventId: string;
  orderId: string;
  userId: string | null;
  at: number;
}

/** Ticket insert keyed by the unique order id; a redelivery inserts nothing. */
export function insertTicket(
  { eventId, orderId, userId, at }: SyncCtx,
  t: { ticketId: string; reservationId: string | null; status: "exception" | "refunded"; reason: string | null }
) {
  return sql`
    INSERT INTO live_tickets
      (id, event_id, user_id, polar_order_id, reservation_id, seat_no, status, exception_reason, recording_consent_at,
       revoked_at, created_at, updated_at)
    VALUES (${t.ticketId}, ${eventId}, ${userId}, ${orderId}, ${t.reservationId}, NULL, ${t.status}, ${t.reason},
      (SELECT recording_consent_at FROM live_ticket_reservations WHERE id = ${t.reservationId} AND event_id = ${eventId}),
      ${t.status === "refunded" ? at : null}, ${at}, ${at})
    ON CONFLICT (polar_order_id) DO NOTHING`;
}

export async function applyPaid(ctx: SyncCtx & { userId: string }, reservationId: string | null, fallbackReason: string): Promise<LiveTicketSyncOutcome> {
  const { db, eventId, userId, at } = ctx;
  const ticketId = crypto.randomUUID();
  const featureKey = liveTicketFeatureKey(eventId);
  // Seat preference: this reservation's seat, then any seat this user holds, then a free/expired one.
  const seatPick = sql`
    SELECT seat_no FROM live_seats
    WHERE event_id = ${eventId}
      AND ((state = 'held' AND (reservation_id = ${reservationId} OR holder_user_id = ${userId}))
        OR state = 'free' OR (state = 'held' AND expires_at <= ${at}))
    ORDER BY CASE WHEN reservation_id = ${reservationId} THEN 0 WHEN holder_user_id = ${userId} THEN 1 ELSE 2 END, seat_no
    LIMIT 1`;
  const ours = sql`EXISTS (SELECT 1 FROM live_seats WHERE event_id = ${eventId} AND ticket_id = ${ticketId})`;
  const [inserted] = await runRawBatch(db, [
    // Provisional exception; promoted to active below only if a seat is claimed for it.
    insertTicket(ctx, { ticketId, reservationId, status: "exception", reason: fallbackReason }),
    sql`
      UPDATE live_seats
      SET state = 'ticketed', ticket_id = ${ticketId}, holder_user_id = ${userId},
          reservation_id = CASE WHEN state = 'held' AND holder_user_id = ${userId} THEN reservation_id ELSE ${reservationId} END,
          expires_at = NULL, updated_at = ${at}
      WHERE event_id = ${eventId}
        AND seat_no = (${seatPick})
        AND state != 'ticketed'
        AND EXISTS (SELECT 1 FROM live_events WHERE id = ${eventId} AND status IN ('sales_open', 'live'))
        AND EXISTS (SELECT 1 FROM live_tickets WHERE id = ${ticketId})
        AND NOT EXISTS (
          SELECT 1 FROM live_tickets
          WHERE event_id = ${eventId} AND user_id = ${userId} AND status = 'active' AND id != ${ticketId}
        )`,
    sql`
      UPDATE live_tickets
      SET status = 'active', exception_reason = NULL, updated_at = ${at},
          seat_no = (SELECT seat_no FROM live_seats WHERE event_id = ${eventId} AND ticket_id = ${ticketId})
      WHERE id = ${ticketId} AND ${ours}`,
    sql`
      UPDATE live_ticket_reservations SET status = 'converted', updated_at = ${at}
      WHERE event_id = ${eventId} AND user_id = ${userId} AND status IN ('held', 'expired')
        AND (id = ${reservationId} OR status = 'held') AND ${ours}`,
    sql`
      INSERT INTO entitlements (id, user_id, feature_key, valid_from, is_active, created_at)
      SELECT ${crypto.randomUUID()}, ${userId}, ${featureKey}, ${at}, 1, ${at}
      WHERE EXISTS (SELECT 1 FROM live_tickets WHERE id = ${ticketId} AND status = 'active')
      ON CONFLICT (user_id, feature_key) DO UPDATE SET is_active = 1, valid_until = NULL`,
  ]);
  if (changesOf(inserted) !== 1) return "duplicate";
  const [ticket] = await db.select({ status: liveTickets.status }).from(liveTickets).where(eq(liveTickets.id, ticketId)).limit(1);
  if (ticket?.status === "active") return "ticketed";
  console.warn("Live ticket paid without a seat; stored as exception for reconciliation:", {
    orderId: ctx.orderId,
    eventId,
    reason: fallbackReason,
  });
  return "exception";
}

export async function applyRefund(ctx: SyncCtx): Promise<LiveTicketSyncOutcome> {
  const { db, eventId, orderId, at } = ctx;
  const featureKey = liveTicketFeatureKey(eventId);
  const ticketOfOrder = sql`(SELECT id FROM live_tickets WHERE polar_order_id = ${orderId})`;
  const ownerOfOrder = sql`(SELECT user_id FROM live_tickets WHERE polar_order_id = ${orderId})`;
  await runRawBatch(db, [
    // Refund before paid: leave a tombstone so a late paid delivery is a duplicate.
    insertTicket(ctx, { ticketId: crypto.randomUUID(), reservationId: null, status: "refunded", reason: null }),
    sql`
      UPDATE live_tickets SET status = 'refunded', revoked_at = ${at}, updated_at = ${at}
      WHERE polar_order_id = ${orderId} AND status != 'refunded'`,
    sql`
      UPDATE live_seats SET state = 'free', holder_user_id = NULL, reservation_id = NULL, ticket_id = NULL,
        expires_at = NULL, updated_at = ${at}
      WHERE event_id = ${eventId} AND ticket_id = ${ticketOfOrder}`,
    sql`
      UPDATE live_attendee_registrations SET status = 'cancelled', join_url_ciphertext = NULL, updated_at = ${at}
      WHERE event_id = ${eventId} AND ticket_id = ${ticketOfOrder}`,
    sql`
      UPDATE entitlements SET is_active = 0, valid_until = ${at}
      WHERE feature_key = ${featureKey} AND user_id = ${ownerOfOrder}
        AND NOT EXISTS (
          SELECT 1 FROM live_tickets
          WHERE event_id = ${eventId} AND user_id = ${ownerOfOrder} AND status = 'active' AND polar_order_id != ${orderId}
        )`,
  ]);
  return "refunded";
}
