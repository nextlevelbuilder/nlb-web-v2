import { inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb, type AppDb } from "@/lib/db";
import { liveTopicGroups, liveTopics } from "@/lib/db/schema";
import { getMyTicketStatus, type LivePublicEvent } from "@/lib/live/event-read-models";
import type { LiveTicketSummary, LiveViewer, TopicGroupInfo } from "@/components/live/live-ui-helpers";

/**
 * Server-side composition for the Live pages: the signed-in viewer, their ticket for one event and
 * the topic-group lookup for the vote. Read models in `lib/live` own every domain query; this file
 * only adds the read-only topic → group join the round view does not carry.
 */

/** The signed-in viewer (session, API key or delegation), or null. Never throws. */
export async function loadLiveViewer(): Promise<LiveViewer | null> {
  try {
    const caller = await resolveCaller(await headers());
    return caller ? { id: caller.user.id, emailVerified: Boolean(caller.user.emailVerified) } : null;
  } catch (error) {
    console.error("live: viewer lookup failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/** The viewer's ticket and hold for an event; null when signed out or on failure (fails closed). */
export async function loadTicketSummary(db: AppDb, event: LivePublicEvent, viewer: LiveViewer | null, now: Date): Promise<LiveTicketSummary | null> {
  if (!viewer) return null;
  try {
    const status = await getMyTicketStatus(db, event.id, viewer.id, now);
    return { ticketStatus: status.ticket?.status ?? null, holdExpiresAt: status.hold?.expiresAt ?? null };
  } catch (error) {
    console.error("live: ticket lookup failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Topic id → its group (localized title), for grouping the round's topics. Empty on failure. */
export async function loadTopicGroups(topicIds: string[], locale: string, db: AppDb = getDb()): Promise<Map<string, TopicGroupInfo>> {
  if (topicIds.length === 0) return new Map();
  try {
    const topics = await db.select({ id: liveTopics.id, groupId: liveTopics.groupId }).from(liveTopics).where(inArray(liveTopics.id, topicIds));
    const groupIds = [...new Set(topics.map((t) => t.groupId))];
    const groups = groupIds.length
      ? await db
          .select({ id: liveTopicGroups.id, titleEn: liveTopicGroups.titleEn, titleVi: liveTopicGroups.titleVi, sortOrder: liveTopicGroups.sortOrder })
          .from(liveTopicGroups)
          .where(inArray(liveTopicGroups.id, groupIds))
      : [];
    const byId = new Map(groups.map((g) => [g.id, { id: g.id, title: locale === "vi" ? g.titleVi : g.titleEn, sortOrder: g.sortOrder }]));
    const result = new Map<string, TopicGroupInfo>();
    for (const topic of topics) {
      const group = byId.get(topic.groupId);
      if (group) result.set(topic.id, group);
    }
    return result;
  } catch (error) {
    console.error("live: topic groups unavailable", error instanceof Error ? error.message : error);
    return new Map();
  }
}
