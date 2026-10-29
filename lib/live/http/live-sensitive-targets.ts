/**
 * Canonical resource and arguments of each sensitive Live operator action. The approval request route
 * and the action route both derive them here, so the approval's `args_hash` always matches what the
 * action consumes (`requireOperator` hashes `args` and compares it with the approved row).
 *
 * - `live.ticket.refund`  → resource `live:ticket:<eventId>`, args `{ ticketId }`
 * - `live.event.cancel`   → resource `live:event:<eventId>`,  args `{ eventId }`
 * - `live.poll.override`  → resource `live:poll:<roundId>`,   args `{ roundId, topicId }`
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { liveTickets } from "@/lib/db/schema";
import { resourceKey } from "@/lib/access/types";
import { liveNotFound } from "@/lib/live/live-errors";

export const LIVE_SENSITIVE_ACTIONS = ["live.ticket.refund", "live.event.cancel", "live.poll.override"] as const;
export type LiveSensitiveAction = (typeof LIVE_SENSITIVE_ACTIONS)[number];

const id = z.string().trim().min(1).max(200);

export const refundTargetSchema = z.object({ ticketId: id }).strict();
export const cancelTargetSchema = z.object({ eventId: id }).strict();
export const overrideTargetSchema = z.object({ roundId: id, topicId: id }).strict();

export interface SensitiveTarget {
  resource: string;
  args: Record<string, string>;
}

export function cancelTarget(eventId: string): SensitiveTarget {
  return { resource: resourceKey({ kind: "live_event", id: eventId }), args: { eventId } };
}

export function overrideTarget(roundId: string, topicId: string): SensitiveTarget {
  return { resource: resourceKey({ kind: "live_poll", roundId }), args: { roundId, topicId } };
}

export function refundTarget(ticket: { id: string; eventId: string }): SensitiveTarget {
  return { resource: resourceKey({ kind: "live_ticket", eventId: ticket.eventId }), args: { ticketId: ticket.id } };
}

/** The ticket a refund targets, or a 404. */
export async function loadTicketForRefund(db: AppDb, ticketId: string): Promise<typeof liveTickets.$inferSelect> {
  const [ticket] = await db.select().from(liveTickets).where(eq(liveTickets.id, ticketId)).limit(1);
  if (!ticket) throw liveNotFound("Ticket");
  return ticket;
}

/** Validates `target` for `action` and returns its canonical resource and arguments. */
export async function resolveSensitiveTarget(db: AppDb, action: LiveSensitiveAction, target: unknown): Promise<SensitiveTarget> {
  switch (action) {
    case "live.ticket.refund": {
      const { ticketId } = refundTargetSchema.parse(target);
      return refundTarget(await loadTicketForRefund(db, ticketId));
    }
    case "live.event.cancel":
      return cancelTarget(cancelTargetSchema.parse(target).eventId);
    case "live.poll.override": {
      const { roundId, topicId } = overrideTargetSchema.parse(target);
      return overrideTarget(roundId, topicId);
    }
  }
}
