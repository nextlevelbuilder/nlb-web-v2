import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { liveAttendeeRegistrations, liveEvents, liveMeetings, liveTickets, users } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { liveNotFound } from "../live-errors";
import { MeetingProviderNotFoundError, type MeetingProvider } from "./meeting-provider";

/**
 * Meeting orchestration over a `MeetingProvider`: one provider meeting per event, one registrant per
 * ticket holder (personal join URL sealed with `lib/crypto/secret-box`), and provider-side
 * cancellation of registrants whose ticket was revoked. A null or unavailable provider fails closed.
 * Join access (time window, attendance) lives in `join-access.ts`.
 */
export interface MeetingServiceDeps {
  db: AppDb;
  provider: MeetingProvider | null;
  /** AES key for join URLs (base64, 32 bytes); defaults to the runtime `ONBOARDING_ENCRYPTION_KEY`. */
  encryptionKey?: string;
}

function requireProvider(provider: MeetingProvider | null): MeetingProvider | null {
  return provider && provider.available ? provider : null;
}

/** Short, non-personal error text for `last_error`. */
function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : "Provider error").slice(0, 300);
}

/**
 * Return the provider meeting id for an event, creating the meeting once. Only the operator route
 * (`POST /api/v1/live-admin/events/{id}/meeting`) calls this; the member join path only reads the
 * meeting, so a burst of joins can never create provider meetings. If two operator calls race, the
 * primary key on `live_meetings.event_id` keeps the first id; the extra provider meeting is logged
 * for manual clean-up (the interface has no delete).
 */
export async function ensureEventMeeting(deps: MeetingServiceDeps, eventId: string): Promise<string | null> {
  const [existing] = await deps.db.select().from(liveMeetings).where(eq(liveMeetings.eventId, eventId)).limit(1);
  if (existing) return existing.providerMeetingId;
  const provider = requireProvider(deps.provider);
  if (!provider) return null;

  const [event] = await deps.db.select().from(liveEvents).where(eq(liveEvents.id, eventId)).limit(1);
  if (!event) throw liveNotFound("Event");
  const { meetingId } = await provider.createMeeting({
    id: event.id,
    titleEn: event.titleEn,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
  });
  await deps.db
    .insert(liveMeetings)
    .values({ eventId, provider: provider.name, providerMeetingId: meetingId })
    .onConflictDoNothing({ target: liveMeetings.eventId });
  const [stored] = await deps.db.select().from(liveMeetings).where(eq(liveMeetings.eventId, eventId)).limit(1);
  if (stored && stored.providerMeetingId !== meetingId) {
    console.warn("Duplicate provider meeting created by a concurrent request; delete it in the provider:", { eventId });
  }
  return stored?.providerMeetingId ?? meetingId;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "NLB", lastName: "Member" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export type RegisterResult = "registered" | "already_registered" | "no_ticket" | "provider_unavailable" | "no_meeting" | "failed";

/**
 * Register the holder of the active ticket for the event with the provider and store the sealed
 * join URL. Idempotent for the same ticket. Never creates the provider meeting: without one the
 * answer is `no_meeting` (an operator has not created it yet). A provider failure is recorded as
 * `failed` with `last_error` and reported, never thrown, so callers can show "not ready".
 */
export async function registerTicketHolder(
  deps: MeetingServiceDeps,
  input: { eventId: string; userId: string; now?: Date }
): Promise<RegisterResult> {
  const { db } = deps;
  const now = input.now ?? new Date();
  const [ticket] = await db
    .select({ id: liveTickets.id })
    .from(liveTickets)
    .where(and(eq(liveTickets.eventId, input.eventId), eq(liveTickets.userId, input.userId), eq(liveTickets.status, "active")))
    .limit(1);
  if (!ticket) return "no_ticket";

  const [current] = await db
    .select()
    .from(liveAttendeeRegistrations)
    .where(and(eq(liveAttendeeRegistrations.eventId, input.eventId), eq(liveAttendeeRegistrations.userId, input.userId)))
    .limit(1);
  if (current?.status === "registered" && current.ticketId === ticket.id && current.joinUrlCiphertext) return "already_registered";

  const provider = requireProvider(deps.provider);
  if (!provider) return "provider_unavailable";
  const [meeting] = await db
    .select({ providerMeetingId: liveMeetings.providerMeetingId })
    .from(liveMeetings)
    .where(eq(liveMeetings.eventId, input.eventId))
    .limit(1);
  if (!meeting) return "no_meeting";
  const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) return "no_ticket";

  const record = (values: Partial<typeof liveAttendeeRegistrations.$inferInsert>) =>
    db
      .insert(liveAttendeeRegistrations)
      .values({ eventId: input.eventId, userId: input.userId, ticketId: ticket.id, status: "pending", ...values, updatedAt: now })
      .onConflictDoUpdate({
        target: [liveAttendeeRegistrations.eventId, liveAttendeeRegistrations.userId],
        set: {
          ticketId: ticket.id, status: "pending", providerRegistrantId: null, joinUrlCiphertext: null, lastError: null,
          cancelAttempts: 0, nextCancelAttemptAt: null, ...values, updatedAt: now,
        },
      });

  try {
    const registrant = await provider.registerAttendee(meeting.providerMeetingId, { email: user.email, ...splitName(user.name) });
    const joinUrlCiphertext = await encryptSecret(registrant.joinUrl, deps.encryptionKey);
    await record({ status: "registered", providerRegistrantId: registrant.registrantId, joinUrlCiphertext });
    return "registered";
  } catch (error) {
    console.error("Live attendee registration failed:", { eventId: input.eventId, error: errorText(error) });
    await record({ status: "failed", lastError: errorText(error) });
    return "failed";
  }
}

export interface CancelRegistrantsResult {
  cancelled: number;
  /** Failed this run and scheduled for a retry with backoff. */
  failed: number;
  /** Failed after the event ended: marked `cancel_abandoned` and no longer retried. */
  abandoned: number;
  /** True when no provider is configured; nothing was attempted and the queue is kept. */
  unavailable: boolean;
}

/** Most registrants handled per run, oldest retry first. */
const CANCEL_BATCH = 200;
const MAX_CANCEL_BACKOFF_MS = 60 * 60_000;

/** Delay before retry `attempts + 1`: 1, 2, 4 … minutes, capped at 60. */
export function cancelRetryDelayMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(attempts - 1, 0), MAX_CANCEL_BACKOFF_MS);
}

/**
 * Cancel provider registrants for registrations already marked `cancelled` (ticket refunded or
 * event cancelled). A kept `provider_registrant_id` marks the provider call as pending; it is
 * cleared after the provider confirms, or answers 404 (already gone), so the sweep is safe to re-run
 * (optionally for one event). Only due rows are picked, oldest retry first. A failure is retried with
 * exponential backoff (`cancelRetryDelayMs`) until the event ends; a failure after that marks the row
 * `cancel_abandoned` (terminal, logged once), so permanently failing rows never block the queue.
 */
export async function cancelProviderRegistrants(
  deps: MeetingServiceDeps,
  eventId?: string,
  now: Date = new Date()
): Promise<CancelRegistrantsResult> {
  const provider = requireProvider(deps.provider);
  const pending = await deps.db
    .select({
      eventId: liveAttendeeRegistrations.eventId,
      userId: liveAttendeeRegistrations.userId,
      registrantId: liveAttendeeRegistrations.providerRegistrantId,
      cancelAttempts: liveAttendeeRegistrations.cancelAttempts,
      meetingId: liveMeetings.providerMeetingId,
      endsAt: liveEvents.endsAt,
    })
    .from(liveAttendeeRegistrations)
    .innerJoin(liveMeetings, eq(liveMeetings.eventId, liveAttendeeRegistrations.eventId))
    .innerJoin(liveEvents, eq(liveEvents.id, liveAttendeeRegistrations.eventId))
    .where(
      and(
        eq(liveAttendeeRegistrations.status, "cancelled"),
        isNotNull(liveAttendeeRegistrations.providerRegistrantId),
        or(isNull(liveAttendeeRegistrations.nextCancelAttemptAt), lte(liveAttendeeRegistrations.nextCancelAttemptAt, now)),
        eventId ? eq(liveAttendeeRegistrations.eventId, eventId) : sql`1 = 1`
      )
    )
    // SQLite sorts NULL first in ascending order, so never-tried rows go before scheduled retries.
    .orderBy(asc(liveAttendeeRegistrations.nextCancelAttemptAt))
    .limit(CANCEL_BATCH);
  if (!provider) return { cancelled: 0, failed: pending.length, abandoned: 0, unavailable: true };

  let cancelled = 0;
  let failed = 0;
  let abandoned = 0;
  for (const row of pending) {
    const where = and(
      eq(liveAttendeeRegistrations.eventId, row.eventId),
      eq(liveAttendeeRegistrations.userId, row.userId),
      eq(liveAttendeeRegistrations.status, "cancelled")
    );
    try {
      try {
        await provider.cancelRegistrant(row.meetingId, row.registrantId as string);
      } catch (error) {
        // Already gone at the provider: nothing is left to cancel.
        if (!(error instanceof MeetingProviderNotFoundError)) throw error;
      }
      await deps.db
        .update(liveAttendeeRegistrations)
        .set({ providerRegistrantId: null, joinUrlCiphertext: null, lastError: null, nextCancelAttemptAt: null, updatedAt: now })
        .where(where);
      cancelled++;
    } catch (error) {
      const attempts = row.cancelAttempts + 1;
      const lastError = errorText(error);
      if (now.getTime() >= row.endsAt.getTime()) {
        abandoned++;
        const gaveUp = await deps.db
          .update(liveAttendeeRegistrations)
          .set({ status: "cancel_abandoned", cancelAttempts: attempts, nextCancelAttemptAt: null, lastError, updatedAt: now })
          .where(where)
          .returning({ userId: liveAttendeeRegistrations.userId });
        if (gaveUp.length > 0) {
          console.warn("Live registrant cancellation abandoned after the event ended; cancel it in the provider:", {
            eventId: row.eventId, attempts, error: lastError,
          });
        }
      } else {
        failed++;
        await deps.db
          .update(liveAttendeeRegistrations)
          .set({ cancelAttempts: attempts, nextCancelAttemptAt: new Date(now.getTime() + cancelRetryDelayMs(attempts)), lastError, updatedAt: now })
          .where(where);
      }
    }
  }
  return { cancelled, failed, abandoned, unavailable: false };
}
