import { asc, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { liveTopicGroups, liveTopics } from "@/lib/db/schema";
import { liveNotFound, LiveError } from "./live-errors";
import { optionalText, requireInt, requireSlug, requireText, withUniqueConflict } from "./live-validation";

/**
 * Operator curation of topic groups and topics. Callers are already authorized (`live:manage`);
 * these functions only validate input and keep data consistent. Archiving keeps rows for history:
 * archived topics stay attached to past rounds but cannot be put into new rounds.
 */
export type LiveTopicGroup = typeof liveTopicGroups.$inferSelect;
export type LiveTopic = typeof liveTopics.$inferSelect;

export interface TopicGroupInput {
  slug: string;
  titleEn: string;
  titleVi: string;
  sortOrder?: number;
}

export async function createTopicGroup(input: TopicGroupInput, db: AppDb): Promise<LiveTopicGroup> {
  const values = {
    slug: requireSlug(input.slug),
    titleEn: requireText(input.titleEn, "titleEn"),
    titleVi: requireText(input.titleVi, "titleVi"),
    sortOrder: input.sortOrder === undefined ? 0 : requireInt(input.sortOrder, "sortOrder", -10_000, 10_000),
  };
  const [row] = await withUniqueConflict("Topic group", () => db.insert(liveTopicGroups).values(values).returning());
  return row;
}

export async function updateTopicGroup(
  id: string,
  patch: Partial<Omit<TopicGroupInput, "slug">>,
  db: AppDb,
  now: Date = new Date()
): Promise<LiveTopicGroup> {
  const set: Partial<typeof liveTopicGroups.$inferInsert> = { updatedAt: now };
  if (patch.titleEn !== undefined) set.titleEn = requireText(patch.titleEn, "titleEn");
  if (patch.titleVi !== undefined) set.titleVi = requireText(patch.titleVi, "titleVi");
  if (patch.sortOrder !== undefined) set.sortOrder = requireInt(patch.sortOrder, "sortOrder", -10_000, 10_000);
  const [row] = await db.update(liveTopicGroups).set(set).where(eq(liveTopicGroups.id, id)).returning();
  if (!row) throw liveNotFound("Topic group");
  return row;
}

/** Archive a group and every topic in it, in one batch. */
export async function archiveTopicGroup(id: string, db: AppDb, now: Date = new Date()): Promise<void> {
  const [, groups] = await db.batch([
    db.update(liveTopics).set({ status: "archived", updatedAt: now }).where(eq(liveTopics.groupId, id)),
    db.update(liveTopicGroups).set({ status: "archived", updatedAt: now }).where(eq(liveTopicGroups.id, id)).returning(),
  ]);
  if (groups.length === 0) throw liveNotFound("Topic group");
}

export interface TopicInput {
  groupId: string;
  slug: string;
  titleEn: string;
  titleVi: string;
  summaryEn?: string;
  summaryVi?: string;
  createdBy: string;
}

export async function createTopic(input: TopicInput, db: AppDb): Promise<LiveTopic> {
  const [group] = await db
    .select({ status: liveTopicGroups.status })
    .from(liveTopicGroups)
    .where(eq(liveTopicGroups.id, input.groupId))
    .limit(1);
  if (!group) throw liveNotFound("Topic group");
  if (group.status !== "active") throw new LiveError(409, "conflict", "Topic group is archived");
  const values = {
    groupId: input.groupId,
    slug: requireSlug(input.slug),
    titleEn: requireText(input.titleEn, "titleEn"),
    titleVi: requireText(input.titleVi, "titleVi"),
    summaryEn: optionalText(input.summaryEn, "summaryEn", 2000) ?? "",
    summaryVi: optionalText(input.summaryVi, "summaryVi", 2000) ?? "",
    createdBy: requireText(input.createdBy, "createdBy"),
  };
  const [row] = await withUniqueConflict("Topic", () => db.insert(liveTopics).values(values).returning());
  return row;
}

export async function updateTopic(
  id: string,
  patch: Partial<Pick<TopicInput, "titleEn" | "titleVi" | "summaryEn" | "summaryVi">>,
  db: AppDb,
  now: Date = new Date()
): Promise<LiveTopic> {
  const set: Partial<typeof liveTopics.$inferInsert> = { updatedAt: now };
  if (patch.titleEn !== undefined) set.titleEn = requireText(patch.titleEn, "titleEn");
  if (patch.titleVi !== undefined) set.titleVi = requireText(patch.titleVi, "titleVi");
  if (patch.summaryEn !== undefined) set.summaryEn = optionalText(patch.summaryEn, "summaryEn", 2000);
  if (patch.summaryVi !== undefined) set.summaryVi = optionalText(patch.summaryVi, "summaryVi", 2000);
  const [row] = await db.update(liveTopics).set(set).where(eq(liveTopics.id, id)).returning();
  if (!row) throw liveNotFound("Topic");
  return row;
}

export async function archiveTopic(id: string, db: AppDb, now: Date = new Date()): Promise<LiveTopic> {
  const [row] = await db
    .update(liveTopics)
    .set({ status: "archived", updatedAt: now })
    .where(eq(liveTopics.id, id))
    .returning();
  if (!row) throw liveNotFound("Topic");
  return row;
}

/** Active groups with their active topics, in display order (operator and public curation views). */
export async function listActiveTopicGroups(db: AppDb): Promise<(LiveTopicGroup & { topics: LiveTopic[] })[]> {
  const groups = await db
    .select()
    .from(liveTopicGroups)
    .where(eq(liveTopicGroups.status, "active"))
    .orderBy(asc(liveTopicGroups.sortOrder), asc(liveTopicGroups.slug));
  const topics = await db
    .select()
    .from(liveTopics)
    .where(eq(liveTopics.status, "active"))
    .orderBy(asc(liveTopics.slug));
  return groups.map((group) => ({ ...group, topics: topics.filter((t) => t.groupId === group.id) }));
}
