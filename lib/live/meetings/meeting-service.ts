import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { liveAttendeeRegistrations, liveEvents, liveMeetings, liveTickets, users } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { liveNotFound } from "../live-errors";
import type { MeetingProvider } from "./meeting-provider";

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
 * Return the provider meeting id for an event, creating the meeting once. If two calls race, the
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

export type RegisterResult = "registered" | "already_registered" | "no_ticket" | "provider_unavailable" | "failed";

/**
 * Register the holder of the active ticket for the event with the provider and store the sealed
 * join URL. Idempotent for the same ticket. A provider failure is recorded as `failed` with
 * `last_error` and reported, never thrown, so callers can show "not ready".
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
  const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) return "no_ticket";

  const record = (values: Partial<typeof liveAttendeeRegistrations.$inferInsert>) =>
    db
      .insert(liveAttendeeRegistrations)
      .values({ eventId: input.eventId, userId: input.userId, ticketId: ticket.id, status: "pending", ...values, updatedAt: now })
      .onConflictDoUpdate({
        target: [liveAttendeeRegistrations.eventId, liveAttendeeRegistrations.userId],
        set: { ticketId: ticket.id, status: "pending", providerRegistrantId: null, joinUrlCiphertext: null, lastError: null, ...values, updatedAt: now },
      });

  try {
    const meetingId = await ensureEventMeeting(deps, input.eventId);
    if (!meetingId) return "provider_unavailable";
    const registrant = await provider.registerAttendee(meetingId, { email: user.email, ...splitName(user.name) });
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
  failed: number;
  /** True when no provider is configured; nothing was attempted and the queue is kept. */
  unavailable: boolean;
}

/**
 * Cancel provider registrants for registrations already marked `cancelled` (ticket refunded or
 * event cancelled). A kept `provider_registrant_id` marks the provider call as pending; it is
 * cleared after the provider confirms, so the sweep is safe to re-run (optionally for one event).
 */
export async function cancelProviderRegistrants(deps: MeetingServiceDeps, eventId?: string): Promise<CancelRegistrantsResult> {
  const provider = requireProvider(deps.provider);
  const pending = await deps.db
    .select({
      eventId: liveAttendeeRegistrations.eventId,
      userId: liveAttendeeRegistrations.userId,
      registrantId: liveAttendeeRegistrations.providerRegistrantId,
      meetingId: liveMeetings.providerMeetingId,
    })
    .from(liveAttendeeRegistrations)
    .innerJoin(liveMeetings, eq(liveMeetings.eventId, liveAttendeeRegistrations.eventId))
    .where(
      and(
        eq(liveAttendeeRegistrations.status, "cancelled"),
        isNotNull(liveAttendeeRegistrations.providerRegistrantId),
        eventId ? eq(liveAttendeeRegistrations.eventId, eventId) : sql`1 = 1`
      )
    )
    .limit(200);
  if (!provider) return { cancelled: 0, failed: pending.length, unavailable: true };

  let cancelled = 0;
  let failed = 0;
  for (const row of pending) {
    const where = and(eq(liveAttendeeRegistrations.eventId, row.eventId), eq(liveAttendeeRegistrations.userId, row.userId));
    try {
      await provider.cancelRegistrant(row.meetingId, row.registrantId as string);
      await deps.db
        .update(liveAttendeeRegistrations)
        .set({ providerRegistrantId: null, joinUrlCiphertext: null, lastError: null, updatedAt: new Date() })
        .where(and(where, eq(liveAttendeeRegistrations.status, "cancelled")));
      cancelled++;
    } catch (error) {
      failed++;
      await deps.db.update(liveAttendeeRegistrations).set({ lastError: errorText(error), updatedAt: new Date() }).where(where);
    }
  }
  return { cancelled, failed, unavailable: false };
}
