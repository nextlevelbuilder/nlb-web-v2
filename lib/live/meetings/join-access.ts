import { and, eq } from "drizzle-orm";
import { entitlements, liveAttendance, liveAttendeeRegistrations, liveEvents, liveTickets } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { LIVE_JOIN_OPENS_BEFORE_MS, liveTicketFeatureKey } from "../types";
import { liveNotFound } from "../live-errors";
import { registerTicketHolder, type MeetingServiceDeps } from "./meeting-service";

export type JoinAccessStatus = "too_early" | "open" | "ended" | "not_ready" | "no_ticket";

export interface JoinAccess {
  status: JoinAccessStatus;
  /** Personal join URL; present only when `status === "open"`. */
  joinUrl?: string;
  opensAt: Date;
  endsAt: Date;
}

/**
 * Join access for an already-authorized user. A join URL is returned only when the user has an
 * `active` ticket backed by an active `live:ticket:<eventId>` entitlement, `now` is inside
 * `[startsAt − LIVE_JOIN_OPENS_BEFORE_MS, endsAt]`, and a provider registration exists. A missing
 * registration is created lazily on the first in-window request; any provider or decryption failure
 * answers `not_ready` (fail closed). The first successful join records attendance once.
 */
export async function getJoinAccess(
  input: { eventId: string; userId: string; now: Date },
  deps: MeetingServiceDeps
): Promise<JoinAccess> {
  const { db } = deps;
  const { eventId, userId, now } = input;
  const [event] = await db
    .select({ status: liveEvents.status, startsAt: liveEvents.startsAt, endsAt: liveEvents.endsAt })
    .from(liveEvents)
    .where(eq(liveEvents.id, eventId))
    .limit(1);
  if (!event || event.status === "draft") throw liveNotFound("Event");
  const opensAt = new Date(event.startsAt.getTime() - LIVE_JOIN_OPENS_BEFORE_MS);
  const base = { opensAt, endsAt: event.endsAt };

  const [ticket] = await db
    .select({ id: liveTickets.id })
    .from(liveTickets)
    .innerJoin(
      entitlements,
      and(
        eq(entitlements.userId, liveTickets.userId),
        eq(entitlements.featureKey, liveTicketFeatureKey(eventId)),
        eq(entitlements.isActive, true)
      )
    )
    .where(and(eq(liveTickets.eventId, eventId), eq(liveTickets.userId, userId), eq(liveTickets.status, "active")))
    .limit(1);
  if (!ticket || event.status === "cancelled") return { status: "no_ticket", ...base };
  if (now.getTime() < opensAt.getTime()) return { status: "too_early", ...base };
  if (now.getTime() > event.endsAt.getTime() || event.status === "ended" || event.status === "archived") {
    return { status: "ended", ...base };
  }

  let registration = await loadRegistration(deps, eventId, userId);
  if (!(registration?.status === "registered" && registration.ticketId === ticket.id && registration.joinUrlCiphertext)) {
    const result = await registerTicketHolder(deps, { eventId, userId, now });
    if (result !== "registered" && result !== "already_registered") return { status: "not_ready", ...base };
    registration = await loadRegistration(deps, eventId, userId);
  }
  if (!registration?.joinUrlCiphertext || registration.ticketId !== ticket.id) return { status: "not_ready", ...base };

  let joinUrl: string;
  try {
    joinUrl = await decryptSecret(registration.joinUrlCiphertext, deps.encryptionKey);
  } catch (error) {
    console.error("Live join URL could not be decrypted:", { eventId, error: error instanceof Error ? error.message : error });
    return { status: "not_ready", ...base };
  }
  await db.insert(liveAttendance).values({ eventId, userId, firstJoinAt: now }).onConflictDoNothing();
  return { status: "open", joinUrl, ...base };
}

async function loadRegistration(deps: MeetingServiceDeps, eventId: string, userId: string) {
  const [row] = await deps.db
    .select()
    .from(liveAttendeeRegistrations)
    .where(and(eq(liveAttendeeRegistrations.eventId, eventId), eq(liveAttendeeRegistrations.userId, userId)))
    .limit(1);
  return row;
}
