import { and, asc, desc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { liveEvents, liveSeats, liveTickets } from "@/lib/db/schema";
import type { LiveEventStatus, LiveTicketStatus } from "./types";
import { isPublicEventStatus } from "./event-lifecycle";
import { findActiveHold } from "./seats";
import type { LiveEventRow } from "./events";

/**
 * Public event views. Drafts are never returned. Internal fields (Polar product and discount ids,
 * creator, course video link) stay out of the view; seats-left is computed from seat rows, counting a
 * held seat whose hold expired as free.
 */
export interface LivePublicEvent {
  id: string;
  slug: string;
  titleEn: string;
  titleVi: string;
  descriptionEn: string;
  descriptionVi: string;
  topicId: string | null;
  status: LiveEventStatus;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  hostName: string;
  capacity: number;
  priceCents: number;
  currency: string;
  refundPolicyEn: string;
  refundPolicyVi: string;
  recordingNoticeEn: string;
  recordingNoticeVi: string;
  hasMemberDiscount: boolean;
  /** Only while sales are open; null otherwise. */
  seatsLeft: number | null;
  cancelledAt: Date | null;
}

const UPCOMING: LiveEventStatus[] = ["scheduled", "sales_open", "live"];
const PAST: LiveEventStatus[] = ["ended", "archived"];

function toPublic(event: LiveEventRow, seatsLeft: number | null): LivePublicEvent {
  return {
    id: event.id,
    slug: event.slug,
    titleEn: event.titleEn,
    titleVi: event.titleVi,
    descriptionEn: event.descriptionEn,
    descriptionVi: event.descriptionVi,
    topicId: event.topicId,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    hostName: event.hostName,
    capacity: event.capacity,
    priceCents: event.priceCents,
    currency: event.currency,
    refundPolicyEn: event.refundPolicyEn,
    refundPolicyVi: event.refundPolicyVi,
    recordingNoticeEn: event.recordingNoticeEn,
    recordingNoticeVi: event.recordingNoticeVi,
    hasMemberDiscount: Boolean(event.vipDiscountId || event.premiumDiscountId),
    seatsLeft: event.status === "sales_open" ? seatsLeft ?? 0 : null,
    cancelledAt: event.cancelledAt,
  };
}

async function seatsLeftByEvent(db: AppDb, eventIds: string[], now: Date): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: liveSeats.eventId, free: sql<number>`count(*)` })
    .from(liveSeats)
    .where(
      and(
        inArray(liveSeats.eventId, eventIds),
        or(eq(liveSeats.state, "free"), and(eq(liveSeats.state, "held"), lte(liveSeats.expiresAt, now)))
      )
    )
    .groupBy(liveSeats.eventId);
  return new Map(rows.map((r) => [r.eventId, Number(r.free)]));
}

async function withSeats(db: AppDb, events: LiveEventRow[], now: Date): Promise<LivePublicEvent[]> {
  const left = await seatsLeftByEvent(
    db,
    events.filter((e) => e.status === "sales_open").map((e) => e.id),
    now
  );
  return events.map((e) => toPublic(e, left.get(e.id) ?? 0));
}

/** Scheduled, on-sale and live events that have not ended, soonest first. */
export async function listUpcomingEvents(db: AppDb, now: Date, limit = 20): Promise<LivePublicEvent[]> {
  const events = await db
    .select()
    .from(liveEvents)
    .where(and(inArray(liveEvents.status, UPCOMING), gt(liveEvents.endsAt, now)))
    .orderBy(asc(liveEvents.startsAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return withSeats(db, events, now);
}

/** Ended and archived events, newest first. */
export async function listPastEvents(db: AppDb, now: Date, limit = 20): Promise<LivePublicEvent[]> {
  const events = await db
    .select()
    .from(liveEvents)
    .where(inArray(liveEvents.status, PAST))
    .orderBy(desc(liveEvents.startsAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return withSeats(db, events, now);
}

/** A published event by slug (cancelled included so buyers see it), or null. Never a draft. */
export async function getPublicEventBySlug(db: AppDb, slug: string, now: Date): Promise<LivePublicEvent | null> {
  const [event] = await db.select().from(liveEvents).where(eq(liveEvents.slug, slug)).limit(1);
  if (!event || !isPublicEventStatus(event.status)) return null;
  const [view] = await withSeats(db, [event], now);
  return view;
}

export interface MyTicketStatus {
  ticket: { id: string; status: LiveTicketStatus; seatNo: number | null; exceptionReason: string | null } | null;
  hold: { reservationId: string; seatNo: number; expiresAt: Date } | null;
}

/** The viewer's latest ticket (any status) and active hold for an event. */
export async function getMyTicketStatus(db: AppDb, eventId: string, userId: string, now: Date): Promise<MyTicketStatus> {
  const [ticket] = await db
    .select({ id: liveTickets.id, status: liveTickets.status, seatNo: liveTickets.seatNo, exceptionReason: liveTickets.exceptionReason })
    .from(liveTickets)
    .where(and(eq(liveTickets.eventId, eventId), eq(liveTickets.userId, userId)))
    .orderBy(sql`case ${liveTickets.status} when 'active' then 0 when 'exception' then 1 else 2 end`, desc(liveTickets.createdAt))
    .limit(1);
  const hold = await findActiveHold(db, eventId, userId, now);
  return {
    ticket: ticket ?? null,
    hold: hold ? { reservationId: hold.id, seatNo: hold.seatNo, expiresAt: hold.expiresAt } : null,
  };
}
