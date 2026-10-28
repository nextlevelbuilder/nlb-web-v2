import { and, desc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { changesOf, runRawBatch } from "./live-d1-batch";
import { liveEvents, liveSeats, liveTicketReservations, liveTickets } from "@/lib/db/schema";
import { LIVE_SEAT_HOLD_MS } from "./types";
import { LiveError, LiveRecordingConsentRequiredError, liveNotFound } from "./live-errors";

/**
 * Seat holds (ADR "Live events and seats"). A hold claims one seat with ONE conditional UPDATE whose
 * `WHERE` re-checks that the seat is free (or its hold expired), that sales are open and that the
 * user holds nothing else for the event. SQLite runs each statement atomically, so concurrent
 * checkouts can never hold more seats than exist, nor two seats for one user. The reservation row
 * is inserted in the same batch, derived from the seat that was actually claimed.
 */
export type LiveReservation = typeof liveTicketReservations.$inferSelect;

const MAX_CLAIM_ATTEMPTS = 3;

export interface HoldSeatInput {
  eventId: string;
  userId: string;
  now: Date;
  /** Buyer accepted that the session is recorded and the replay may be sold later. */
  recordingConsent: boolean;
}

export interface HoldSeatResult {
  reservation: LiveReservation;
  /** False when an existing active hold was returned instead of claiming a new seat. */
  created: boolean;
}

/** A seat counts as claimable when free, or held with an expired hold. */
const claimableSeat = (now: number) => sql`(state = 'free' OR (state = 'held' AND expires_at <= ${now}))`;

export async function holdSeat(input: HoldSeatInput, db: AppDb): Promise<HoldSeatResult> {
  const { eventId, userId, now } = input;
  if (input.recordingConsent !== true) throw new LiveRecordingConsentRequiredError();
  if (!userId) throw new LiveError(400, "invalid_input", "userId is required");

  const [event] = await db.select({ status: liveEvents.status }).from(liveEvents).where(eq(liveEvents.id, eventId)).limit(1);
  if (!event || event.status === "draft") throw liveNotFound("Event");
  if (event.status !== "sales_open") throw new LiveError(409, "sales_not_open", "Ticket sales are not open for this event");

  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    const existing = await findActiveHold(db, eventId, userId, now);
    if (existing) return { reservation: existing, created: false };
    await assertNoTicket(db, eventId, userId);

    const at = now.getTime();
    const reservationId = crypto.randomUUID();
    const expiresAt = at + LIVE_SEAT_HOLD_MS;
    const [, claimed] = await runRawBatch(db, [
      // Holds whose time ran out are no longer active reservations.
      sql`
        UPDATE live_ticket_reservations SET status = 'expired', updated_at = ${at}
        WHERE event_id = ${eventId} AND status = 'held' AND expires_at <= ${at}`,
      sql`
        UPDATE live_seats
        SET state = 'held', holder_user_id = ${userId}, reservation_id = ${reservationId}, ticket_id = NULL,
            expires_at = ${expiresAt}, updated_at = ${at}
        WHERE event_id = ${eventId}
          AND seat_no = (
            SELECT seat_no FROM live_seats WHERE event_id = ${eventId} AND ${claimableSeat(at)} ORDER BY seat_no LIMIT 1
          )
          AND ${claimableSeat(at)}
          AND EXISTS (SELECT 1 FROM live_events WHERE id = ${eventId} AND status = 'sales_open')
          AND NOT EXISTS (
            SELECT 1 FROM live_seats AS mine
            WHERE mine.event_id = ${eventId} AND mine.holder_user_id = ${userId}
              AND (mine.state = 'ticketed' OR (mine.state = 'held' AND mine.expires_at > ${at}))
          )`,
      sql`
        INSERT INTO live_ticket_reservations
          (id, event_id, user_id, seat_no, status, expires_at, recording_consent_at, created_at, updated_at)
        SELECT ${reservationId}, event_id, ${userId}, seat_no, 'held', ${expiresAt}, ${at}, ${at}, ${at}
        FROM live_seats WHERE event_id = ${eventId} AND reservation_id = ${reservationId}`,
    ]);
    if (changesOf(claimed) === 1) {
      const [reservation] = await db.select().from(liveTicketReservations).where(eq(liveTicketReservations.id, reservationId)).limit(1);
      return { reservation, created: true };
    }
    // Lost a race: another request of this user may have won, or the last seat went elsewhere.
    if (!(await hasClaimableSeat(db, eventId, now))) break;
  }

  const existing = await findActiveHold(db, eventId, userId, now);
  if (existing) return { reservation: existing, created: false };
  await assertNoTicket(db, eventId, userId);
  const [current] = await db.select({ status: liveEvents.status }).from(liveEvents).where(eq(liveEvents.id, eventId)).limit(1);
  if (current?.status !== "sales_open") throw new LiveError(409, "sales_not_open", "Ticket sales are not open for this event");
  throw new LiveError(409, "sold_out", "All seats are taken");
}

/** The user's unexpired hold for the event whose seat is still held by it, if any. */
export async function findActiveHold(db: AppDb, eventId: string, userId: string, now: Date): Promise<LiveReservation | null> {
  const [row] = await db
    .select({ reservation: liveTicketReservations })
    .from(liveTicketReservations)
    .innerJoin(
      liveSeats,
      and(
        eq(liveSeats.eventId, liveTicketReservations.eventId),
        eq(liveSeats.seatNo, liveTicketReservations.seatNo),
        eq(liveSeats.reservationId, liveTicketReservations.id),
        eq(liveSeats.state, "held")
      )
    )
    .where(
      and(
        eq(liveTicketReservations.eventId, eventId),
        eq(liveTicketReservations.userId, userId),
        eq(liveTicketReservations.status, "held"),
        gt(liveTicketReservations.expiresAt, now)
      )
    )
    .orderBy(desc(liveTicketReservations.createdAt))
    .limit(1);
  return row?.reservation ?? null;
}

/** One ticket per user per event: an active ticket, or a paid order awaiting reconciliation, blocks a new hold. */
async function assertNoTicket(db: AppDb, eventId: string, userId: string): Promise<void> {
  const [ticket] = await db
    .select({ status: liveTickets.status })
    .from(liveTickets)
    .where(and(eq(liveTickets.eventId, eventId), eq(liveTickets.userId, userId), inArray(liveTickets.status, ["active", "exception"])))
    .limit(1);
  if (ticket) throw new LiveError(409, "already_ticketed", "You already have a ticket for this event");
}

async function hasClaimableSeat(db: AppDb, eventId: string, now: Date): Promise<boolean> {
  const [seat] = await db
    .select({ seatNo: liveSeats.seatNo })
    .from(liveSeats)
    .where(
      and(
        eq(liveSeats.eventId, eventId),
        or(eq(liveSeats.state, "free"), and(eq(liveSeats.state, "held"), lte(liveSeats.expiresAt, now)))
      )
    )
    .limit(1);
  return Boolean(seat);
}

/**
 * Return expired holds to the pool (all events, or one). Holds are also reclaimed lazily by
 * `holdSeat`, so this is housekeeping that keeps seat counts and reservation statuses tidy.
 */
export async function releaseExpiredHolds(db: AppDb, now: Date, eventId?: string): Promise<{ seatsReleased: number }> {
  const at = now.getTime();
  const scope = eventId ? sql`AND event_id = ${eventId}` : sql``;
  const [, seats] = await runRawBatch(db, [
    sql`
      UPDATE live_ticket_reservations SET status = 'expired', updated_at = ${at}
      WHERE status = 'held' AND expires_at <= ${at} ${scope}`,
    sql`
      UPDATE live_seats SET state = 'free', holder_user_id = NULL, reservation_id = NULL, expires_at = NULL, updated_at = ${at}
      WHERE state = 'held' AND expires_at <= ${at} ${scope}`,
  ]);
  return { seatsReleased: changesOf(seats) };
}
