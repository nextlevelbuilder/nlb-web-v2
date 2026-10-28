import { desc, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { liveEvents, livePollRounds } from "@/lib/db/schema";
import type { LiveEventStatus, LiveTicketStatus } from "./types";

/**
 * Aggregate Live funnel counts for operators: voters per round, holds, tickets by status and
 * attendance per event. Counts only — no user ids, emails or other personal data leave this module.
 */
export interface LiveRoundFunnel {
  roundId: string;
  slug: string;
  voters: number;
}

export interface LiveEventFunnel {
  eventId: string;
  slug: string;
  status: LiveEventStatus;
  capacity: number;
  /** Reservations ever created (each checkout start). */
  holdsCreated: number;
  /** Unexpired holds at `now`. */
  activeHolds: number;
  tickets: Record<LiveTicketStatus, number>;
  attendees: number;
}

export interface LiveFunnelMetrics {
  rounds: LiveRoundFunnel[];
  events: LiveEventFunnel[];
}

function countMap(rows: { key: string; n: number }[]): Map<string, number> {
  return new Map(rows.map((r) => [r.key, Number(r.n)]));
}

export async function getLiveFunnelMetrics(db: AppDb, now: Date, limit = 20): Promise<LiveFunnelMetrics> {
  const take = Math.min(Math.max(limit, 1), 100);
  const at = now.getTime();
  const rounds = await db
    .select({ id: livePollRounds.id, slug: livePollRounds.slug })
    .from(livePollRounds)
    .orderBy(desc(livePollRounds.opensAt))
    .limit(take);
  const events = await db
    .select({ id: liveEvents.id, slug: liveEvents.slug, status: liveEvents.status, capacity: liveEvents.capacity })
    .from(liveEvents)
    .orderBy(desc(liveEvents.startsAt))
    .limit(take);

  const [voters, holds, active, tickets, attendees] = await Promise.all([
    db.all<{ key: string; n: number }>(sql`SELECT round_id AS key, count(*) AS n FROM live_votes GROUP BY round_id`),
    db.all<{ key: string; n: number }>(sql`SELECT event_id AS key, count(*) AS n FROM live_ticket_reservations GROUP BY event_id`),
    db.all<{ key: string; n: number }>(
      sql`SELECT event_id AS key, count(*) AS n FROM live_seats WHERE state = 'held' AND expires_at > ${at} GROUP BY event_id`
    ),
    db.all<{ event_id: string; status: LiveTicketStatus; n: number }>(
      sql`SELECT event_id, status, count(*) AS n FROM live_tickets GROUP BY event_id, status`
    ),
    db.all<{ key: string; n: number }>(sql`SELECT event_id AS key, count(*) AS n FROM live_attendance GROUP BY event_id`),
  ]);
  const voterCounts = countMap(voters);
  const holdCounts = countMap(holds);
  const activeCounts = countMap(active);
  const attendeeCounts = countMap(attendees);

  return {
    rounds: rounds.map((r) => ({ roundId: r.id, slug: r.slug, voters: voterCounts.get(r.id) ?? 0 })),
    events: events.map((e) => {
      const byStatus: Record<LiveTicketStatus, number> = { active: 0, refunded: 0, cancelled: 0, exception: 0 };
      for (const row of tickets) if (row.event_id === e.id) byStatus[row.status] = Number(row.n);
      return {
        eventId: e.id,
        slug: e.slug,
        status: e.status,
        capacity: e.capacity,
        holdsCreated: holdCounts.get(e.id) ?? 0,
        activeHolds: activeCounts.get(e.id) ?? 0,
        tickets: byStatus,
        attendees: attendeeCounts.get(e.id) ?? 0,
      };
    }),
  };
}
