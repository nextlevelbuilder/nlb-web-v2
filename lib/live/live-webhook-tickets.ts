import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { changesOf, runRawBatch } from "./live-d1-batch";
import { applyPaid, applyRefund, insertTicket, type LiveTicketSyncOutcome } from "./live-ticket-order-writes";
import { liveEvents, liveTickets, users } from "@/lib/db/schema";

/**
 * Polar order → Live ticket sync (ADR "Ticket payment"). Polar is the source of truth for money;
 * this keeps `live_tickets`, `live_seats` and the `live:ticket:<eventId>` entitlement in step:
 *
 * - paid: one ticket per `polar_order_id` (unique; insert-or-nothing), the buyer's held seat — or any
 *   free seat if the hold expired and was taken — becomes `ticketed`, and the entitlement is granted.
 *   No seat → ticket `exception` 'sold_out'; no account → `exception` 'no_account'; a buyer who already
 *   holds an active ticket → `exception` 'duplicate_purchase'. Access is never
 *   granted without a seat, and paid money is never dropped.
 * - full refund: ticket `refunded`, seat freed, registration cancelled, entitlement revoked unless the
 *   user holds another active ticket for the event. A refund that arrives before the paid event
 *   leaves a `refunded` tombstone, so a late paid delivery never grants access.
 * Each outcome is written in one D1 batch, so a retried delivery never sees half a ticket.
 */
export interface LiveOrderEvent {
  type: string;
  data?: {
    id?: string;
    status?: string;
    paid?: boolean;
    product_id?: string;
    product?: { id?: string };
    customer_email?: string;
    customer?: { email?: string };
    metadata?: Record<string, unknown>;
  };
}


/** Live ticket products are created at runtime, so the webhook matches them in D1. */
export async function hasLiveTicketProduct(productIds: readonly string[], db: AppDb): Promise<boolean> {
  if (productIds.length === 0) return false;
  const [match] = await db
    .select({ id: liveEvents.id })
    .from(liveEvents)
    .where(inArray(liveEvents.polarProductId, [...productIds]))
    .limit(1);
  return Boolean(match);
}

async function resolveBuyerUserId(order: NonNullable<LiveOrderEvent["data"]>, db: AppDb): Promise<string | null> {
  const metadataUserId = typeof order.metadata?.userId === "string" ? order.metadata.userId : null;
  if (metadataUserId) {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, metadataUserId)).limit(1);
    if (user) return user.id;
  }
  const email = (order.customer?.email || order.customer_email || "").trim().toLowerCase();
  if (!email) return null;
  const [user] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  return user?.id ?? null;
}

export async function syncLiveTicketFromOrder(event: LiveOrderEvent, db: AppDb, now: Date = new Date()): Promise<LiveTicketSyncOutcome> {
  const order = event.data;
  const productId = order?.product_id || order?.product?.id;
  if (!order || !productId) return "ignored";

  const [liveEvent] = await db
    .select({ id: liveEvents.id, status: liveEvents.status })
    .from(liveEvents)
    .where(eq(liveEvents.polarProductId, productId))
    .limit(1);
  if (!liveEvent) return "ignored";
  if (!order.id) {
    console.warn("Live ticket order without an id; skipped:", { eventId: liveEvent.id });
    return "ignored";
  }

  // Polar sends `order.refunded` for partial refunds too; only a full refund revokes the ticket.
  const refunded = order.status === "refunded" || (event.type === "order.refunded" && order.status !== "partially_refunded");
  const paid =
    !refunded &&
    order.status !== "partially_refunded" &&
    (order.status === "paid" || order.paid === true || event.type === "order.paid");
  if (!refunded && !paid) return "ignored";

  const userId = await resolveBuyerUserId(order, db);
  const ctx = { db, eventId: liveEvent.id, orderId: order.id, userId, at: now.getTime() };
  if (refunded) return applyRefund(ctx);

  const [existing] = await db.select({ id: liveTickets.id }).from(liveTickets).where(eq(liveTickets.polarOrderId, order.id)).limit(1);
  if (existing) return "duplicate";

  const reservationId = typeof order.metadata?.reservationId === "string" ? order.metadata.reservationId : null;
  if (!userId) {
    console.warn("Live ticket paid by an email with no account; stored as exception:", { orderId: order.id, eventId: liveEvent.id });
    const [inserted] = await runRawBatch(db, [
      insertTicket(ctx, { ticketId: crypto.randomUUID(), reservationId, status: "exception", reason: "no_account" }),
    ]);
    return changesOf(inserted) === 1 ? "exception" : "duplicate";
  }
  // A second paid order from someone who already holds a ticket is not given a second seat.
  const [alreadyTicketed] = await db
    .select({ id: liveTickets.id })
    .from(liveTickets)
    .where(and(eq(liveTickets.eventId, liveEvent.id), eq(liveTickets.userId, userId), eq(liveTickets.status, "active")))
    .limit(1);
  const sellable = liveEvent.status === "sales_open" || liveEvent.status === "live";
  const reason = alreadyTicketed ? "duplicate_purchase" : sellable ? "sold_out" : "event_unavailable";
  return applyPaid({ ...ctx, userId }, reservationId, reason);
}

export type { LiveTicketSyncOutcome };
