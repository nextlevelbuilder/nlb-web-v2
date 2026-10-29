/**
 * Read queries the Live REST layer needs beyond the domain read models: operator lists (drafts
 * included), the ticket ledger of an event with minimal personal data (user id only), the operator audit
 * trail with keyset pagination, and the event row behind a public slug.
 */
import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { liveEvents, livePollRounds, liveTickets, liveTopicGroups, liveTopics, operatorAuditLogs } from "@/lib/db/schema";
import { encodeCursor, type Cursor, type Pagination } from "@/lib/builder-league/http";
import { isPublicEventStatus } from "@/lib/live/event-lifecycle";
import type { LiveEventRow } from "@/lib/live/events";
import type { LiveEventStatus, LiveTicketStatus } from "@/lib/live/types";

/** The event row behind a public slug, or null for unknown slugs and drafts. */
export async function findPublishedEventBySlug(db: AppDb, slug: string): Promise<LiveEventRow | null> {
  const [event] = await db.select().from(liveEvents).where(eq(liveEvents.slug, slug)).limit(1);
  return event && isPublicEventStatus(event.status) ? event : null;
}

/** Every topic group (archived included) with its topics, in display order. */
export async function listTopicGroupsForOperator(db: AppDb) {
  const groups = await db.select().from(liveTopicGroups).orderBy(asc(liveTopicGroups.sortOrder), asc(liveTopicGroups.slug));
  const topics = await db.select().from(liveTopics).orderBy(asc(liveTopics.slug));
  return groups.map((group) => ({ ...group, topics: topics.filter((topic) => topic.groupId === group.id) }));
}

export async function listTopicsForOperator(db: AppDb, groupId: string | null) {
  return db
    .select()
    .from(liveTopics)
    .where(groupId ? eq(liveTopics.groupId, groupId) : undefined)
    .orderBy(asc(liveTopics.slug))
    .limit(500);
}

/** Rounds newest first (by opening time). */
export async function listRoundsForOperator(db: AppDb, limit: number) {
  return db.select().from(livePollRounds).orderBy(desc(livePollRounds.opensAt)).limit(limit);
}

/** Events newest first (by start), drafts included, optionally filtered by status. */
export async function listEventsForOperator(db: AppDb, status: LiveEventStatus | null, limit: number): Promise<LiveEventRow[]> {
  return db
    .select()
    .from(liveEvents)
    .where(status ? eq(liveEvents.status, status) : undefined)
    .orderBy(desc(liveEvents.startsAt))
    .limit(limit);
}

export interface OperatorTicketView {
  id: string;
  eventId: string;
  userId: string | null;
  polarOrderId: string;
  status: LiveTicketStatus;
  seatNo: number | null;
  exceptionReason: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}

/** Tickets of one event (exceptions included) and counts by status. No emails or names. */
export async function listEventTickets(db: AppDb, eventId: string): Promise<{ tickets: OperatorTicketView[]; counts: Record<LiveTicketStatus, number> }> {
  const tickets = await db
    .select({
      id: liveTickets.id,
      eventId: liveTickets.eventId,
      userId: liveTickets.userId,
      polarOrderId: liveTickets.polarOrderId,
      status: liveTickets.status,
      seatNo: liveTickets.seatNo,
      exceptionReason: liveTickets.exceptionReason,
      createdAt: liveTickets.createdAt,
      revokedAt: liveTickets.revokedAt,
    })
    .from(liveTickets)
    .where(eq(liveTickets.eventId, eventId))
    .orderBy(sql`case ${liveTickets.status} when 'exception' then 0 when 'active' then 1 else 2 end`, asc(liveTickets.createdAt))
    .limit(10_000);
  const counts: Record<LiveTicketStatus, number> = { active: 0, refunded: 0, cancelled: 0, exception: 0 };
  for (const ticket of tickets) counts[ticket.status] += 1;
  return { tickets, counts };
}

/** One page of the audit trail, newest first, optionally for one exact resource string. */
export async function listAuditPage(
  db: AppDb,
  input: { resource: string | null; cursor: Cursor | null; limit: number }
): Promise<{ items: (typeof operatorAuditLogs.$inferSelect)[]; pagination: Pagination }> {
  const conditions = [
    input.resource ? eq(operatorAuditLogs.resource, input.resource) : undefined,
    input.cursor
      ? or(
          lt(operatorAuditLogs.createdAt, new Date(input.cursor.at)),
          and(eq(operatorAuditLogs.createdAt, new Date(input.cursor.at)), lt(operatorAuditLogs.id, input.cursor.id))
        )
      : undefined,
  ];
  const rows = await db
    .select()
    .from(operatorAuditLogs)
    .where(and(...conditions))
    .orderBy(desc(operatorAuditLogs.createdAt), desc(operatorAuditLogs.id))
    .limit(input.limit + 1);
  const items = rows.slice(0, input.limit);
  const last = items[items.length - 1];
  const nextCursor = rows.length > input.limit && last ? encodeCursor({ at: last.createdAt.getTime(), id: last.id }) : null;
  return { items, pagination: { nextCursor, limit: input.limit } };
}
