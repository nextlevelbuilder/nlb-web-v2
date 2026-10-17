/**
 * The private Builder Journey: one chronological list of everything that happened to a member, built
 * from the append-only `builder_events` plus the evidence, rank and badge rows that explain them.
 *
 * - Ordering is stable: `occurredAt` ascending, then the item id, so equal timestamps never reshuffle.
 * - Corrections and reversals are shown as their own items and mark the item they supersede; nothing
 *   is hidden or rewritten.
 * - Backfilled items carry their provenance (source, original date, import date) and are never spread
 *   over months that have no record.
 * - Evidence that is still pending, needs info or was rejected appears as such, never as a milestone.
 *
 * The journey is private to its owner. `publicJourneyItems` is the only projection meant for other
 * viewers and keeps verified, public, non-superseded items only.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import {
  activityEvidence,
  badgeAwards,
  builderEvents,
  builderProjects,
  rankAwards,
  scoreLedger,
} from "@/lib/db/schema";
import { BuilderApiError, encodeCursor, type Cursor } from "./http";
import { localDateKey } from "./time-windows";
import type { BuilderEventKind, EvidenceStatus, RankKey, Stage, Verification, Visibility } from "./types";

/** Hard ceiling on rows read per source; a member's whole history fits well inside it. */
const MAX_ROWS_PER_SOURCE = 5000;

export type JourneyItemSource = "event" | "evidence" | "rank" | "badge";

/** How the item stands today, after every later correction or reversal is applied. */
export type JourneyItemState =
  | "verified"
  | "self_reported"
  | "pending"
  | "needs_info"
  | "rejected"
  | "withdrawn"
  | "corrected"
  | "reversed"
  | "revoked";

export interface JourneyProvenance {
  /** `backfill` for imported history, otherwise the live event source. */
  source: string;
  /** Free-form label of the import, e.g. `legacy-d1-import`. */
  label: string | null;
  /** When the fact originally happened (epoch ms). */
  originalAt: number;
  /** When it was imported into the Builder League (epoch ms). */
  importedAt: number;
}

export type JourneyRelationType = "corrects" | "reverses" | "corrected_by" | "reversed_by" | "led_to" | "followed_pivot";

export interface JourneyRelation {
  type: JourneyRelationType;
  itemId: string;
}

export interface JourneyItem {
  /** Stable id: the `builder_events.id`, or `evidence:<id>`, `rank:<id>`, `badge:<id>`. */
  id: string;
  source: JourneyItemSource;
  kind: BuilderEventKind | "evidence" | "rank_award" | "badge_award";
  eventType: string;
  stage: Stage | null;
  occurredAt: number;
  /** Local (UTC+7) calendar date of `occurredAt`. */
  localDate: string;
  title: string | null;
  summary: string | null;
  projectId: string | null;
  projectName: string | null;
  verification: Verification | null;
  visibility: Visibility;
  state: JourneyItemState;
  /** Net RP recorded in the ledger for this event (reversals included). */
  rp: number;
  links: string[];
  /** Present only for backfilled items. */
  provenance: JourneyProvenance | null;
  relations: JourneyRelation[];
  /** True for stop/pivot decisions: an evidence-backed learning, not a failure. */
  learning: boolean;
  rank: RankKey | null;
  badgeKey: string | null;
}

export interface JourneyProjectGroup {
  projectId: string | null;
  projectName: string | null;
  firstAt: number;
  lastAt: number;
  itemIds: string[];
}

export interface Journey {
  items: JourneyItem[];
  projects: JourneyProjectGroup[];
}

const VERIFIED_LEVELS: readonly Verification[] = ["peer_confirmed", "moderator_verified", "system_verified"];

/** Event types that record an evidence-backed decision to stop or pivot. */
const LEARNING_TYPES = new Set(["validate_stop_pivot"]);

export function isVerified(verification: Verification | null | undefined): boolean {
  return Boolean(verification && VERIFIED_LEVELS.includes(verification));
}

/** Total order used everywhere: time first, id second. */
export function compareJourneyItems(a: Pick<JourneyItem, "occurredAt" | "id">, b: Pick<JourneyItem, "occurredAt" | "id">): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt - b.occurredAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function evidenceState(status: EvidenceStatus): JourneyItemState {
  switch (status) {
    case "submitted":
      return "pending";
    case "needs_info":
      return "needs_info";
    case "rejected":
      return "rejected";
    case "withdrawn":
      return "withdrawn";
    case "approved":
      return "pending"; // approved evidence without an event yet is waiting for the award
  }
}

function provenanceFor(event: typeof builderEvents.$inferSelect): JourneyProvenance | null {
  if (event.kind !== "backfill" && event.source !== "backfill") return null;
  const raw = event.provenance ?? {};
  const label = stringOrNull(raw.source) ?? stringOrNull(raw.label) ?? stringOrNull(raw.importSource);
  return {
    source: "backfill",
    label,
    originalAt: event.occurredAt.getTime(),
    importedAt: event.receivedAt.getTime(),
  };
}

/**
 * Reads the member's whole journey. Items are in stable chronological order; superseded items stay in
 * place with state `corrected` / `reversed` and point at the item that superseded them.
 */
export async function getJourney(db: AppDb, userId: string): Promise<Journey> {
  const [events, evidence, ranks, badges, projects] = await Promise.all([
    db.select().from(builderEvents).where(eq(builderEvents.subjectUserId, userId)).limit(MAX_ROWS_PER_SOURCE),
    db.select().from(activityEvidence).where(eq(activityEvidence.userId, userId)).limit(MAX_ROWS_PER_SOURCE),
    db.select().from(rankAwards).where(eq(rankAwards.userId, userId)).limit(MAX_ROWS_PER_SOURCE),
    db.select().from(badgeAwards).where(eq(badgeAwards.userId, userId)).limit(MAX_ROWS_PER_SOURCE),
    db.select({ id: builderProjects.id, name: builderProjects.name }).from(builderProjects).where(eq(builderProjects.ownerUserId, userId)),
  ]);

  const rpByEvent = new Map<string, number>();
  if (events.length > 0) {
    const ids = events.map((e) => e.id);
    for (let i = 0; i < ids.length; i += 90) {
      const rows = await db
        .select({ eventId: scoreLedger.eventId, rp: sql<number>`coalesce(sum(${scoreLedger.rp}), 0)` })
        .from(scoreLedger)
        .where(and(eq(scoreLedger.userId, userId), inArray(scoreLedger.eventId, ids.slice(i, i + 90))))
        .groupBy(scoreLedger.eventId);
      for (const row of rows) rpByEvent.set(row.eventId, Number(row.rp));
    }
  }

  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  return buildJourney({ events, evidence, ranks, badges, projectNames, rpByEvent, evidenceById });
}

interface JourneyInputs {
  events: (typeof builderEvents.$inferSelect)[];
  evidence: (typeof activityEvidence.$inferSelect)[];
  ranks: (typeof rankAwards.$inferSelect)[];
  badges: (typeof badgeAwards.$inferSelect)[];
  projectNames: Map<string, string>;
  rpByEvent: Map<string, number>;
  evidenceById: Map<string, typeof activityEvidence.$inferSelect>;
}

/** Pure assembly of the journey from rows; exported for tests and the yearly snapshot. */
export function buildJourney(inputs: JourneyInputs): Journey {
  const { events, evidence, ranks, badges, projectNames, rpByEvent, evidenceById } = inputs;
  const items: JourneyItem[] = [];
  const eventIdsWithEvidence = new Set<string>();
  const rankEventIds = new Set<string>();
  // A badge award also writes a `badge` event; the award row is the one shown (it carries revocation).
  const badgeAwardIds = new Set(badges.map((row) => row.id));

  for (const event of events) {
    if (event.kind === "badge" && badgeAwardIds.has(stringOrNull((event.payload ?? {}).awardId) ?? "")) continue;
    const linked = event.evidenceId ? evidenceById.get(event.evidenceId) : undefined;
    if (linked) eventIdsWithEvidence.add(linked.id);
    const payload = event.payload ?? {};
    const isAdministrative = event.kind === "reversal" || event.kind === "correction" || event.kind === "adjustment";
    items.push({
      id: event.id,
      source: "event",
      kind: event.kind,
      eventType: event.eventType,
      stage: event.stage,
      occurredAt: event.occurredAt.getTime(),
      localDate: localDateKey(event.occurredAt),
      title: linked?.title ?? stringOrNull(payload.title),
      summary: linked?.summary || stringOrNull(payload.summary) || (isAdministrative ? stringOrNull(payload.note) : null),
      projectId: event.projectId,
      projectName: event.projectId ? projectNames.get(event.projectId) ?? null : null,
      verification: event.verification,
      visibility: event.visibility,
      state: isVerified(event.verification) ? "verified" : "self_reported",
      rp: rpByEvent.get(event.id) ?? 0,
      links: linked?.links ?? [],
      provenance: provenanceFor(event),
      relations: [],
      learning: LEARNING_TYPES.has(event.eventType),
      rank: event.kind === "rank" ? (stringOrNull(payload.rank) as RankKey | null) : null,
      badgeKey: event.kind === "badge" ? stringOrNull(payload.badgeKey) : null,
    });
  }

  // Evidence that has not become an event yet (pending, needs info, rejected, withdrawn).
  for (const row of evidence) {
    if (eventIdsWithEvidence.has(row.id) || row.eventId) continue;
    items.push({
      id: `evidence:${row.id}`,
      source: "evidence",
      kind: "evidence",
      eventType: row.eventType,
      stage: row.stage,
      occurredAt: row.occurredAt.getTime(),
      localDate: localDateKey(row.occurredAt),
      title: row.title,
      summary: row.summary || null,
      projectId: row.projectId,
      projectName: row.projectId ? projectNames.get(row.projectId) ?? null : null,
      verification: null,
      visibility: row.visibility,
      state: evidenceState(row.status),
      rp: 0,
      links: row.links ?? [],
      provenance: null,
      relations: [],
      learning: LEARNING_TYPES.has(row.eventType),
      rank: null,
      badgeKey: null,
    });
  }

  for (const event of events) if (event.kind === "rank") rankEventIds.add(event.id);
  for (const row of ranks) {
    if (row.eventId && rankEventIds.has(row.eventId)) continue;
    items.push({
      id: `rank:${row.id}`,
      source: "rank",
      kind: "rank_award",
      eventType: "rank_award",
      stage: null,
      occurredAt: row.awardedAt.getTime(),
      localDate: localDateKey(row.awardedAt),
      title: null,
      summary: null,
      projectId: null,
      projectName: null,
      verification: "moderator_verified",
      visibility: "private",
      state: "verified",
      rp: 0,
      links: [],
      provenance: null,
      relations: [],
      learning: false,
      rank: row.rank,
      badgeKey: null,
    });
  }

  for (const row of badges) {
    items.push({
      id: `badge:${row.id}`,
      source: "badge",
      kind: "badge_award",
      eventType: "badge_award",
      stage: null,
      occurredAt: row.awardedAt.getTime(),
      localDate: localDateKey(row.awardedAt),
      title: null,
      summary: row.revokedAt ? row.revokeReason : null,
      projectId: null,
      projectName: null,
      verification: "system_verified",
      visibility: "private",
      state: row.revokedAt ? "revoked" : "verified",
      rp: 0,
      links: [],
      provenance: null,
      relations: [],
      learning: false,
      rank: null,
      badgeKey: row.badgeKey,
    });
  }

  items.sort(compareJourneyItems);
  linkSupersessions(items, events);
  linkPivots(items);
  return { items, projects: groupByProject(items) };
}

/** Marks superseded items and links both sides of every correction and reversal. */
function linkSupersessions(items: JourneyItem[], events: (typeof builderEvents.$inferSelect)[]): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const event of events) {
    if (!event.supersedesEventId) continue;
    const target = byId.get(event.supersedesEventId);
    const self = byId.get(event.id);
    if (!target || !self) continue;
    if (event.kind === "reversal") {
      target.state = "reversed";
      target.relations.push({ type: "reversed_by", itemId: self.id });
      self.relations.push({ type: "reverses", itemId: target.id });
    } else {
      target.state = target.state === "reversed" ? "reversed" : "corrected";
      target.relations.push({ type: "corrected_by", itemId: self.id });
      self.relations.push({ type: "corrects", itemId: target.id });
    }
  }
}

function isLiveMilestone(item: JourneyItem): boolean {
  return item.source === "event" && (item.kind === "activity" || item.kind === "backfill" || item.kind === "correction") &&
    item.state === "verified";
}

/**
 * A stop/pivot decision "led to" the next verified VALIDATE milestone: on the same project when there
 * is one, otherwise on any other project (a pivot usually starts a new one).
 */
function linkPivots(items: JourneyItem[]): void {
  items.forEach((item, index) => {
    if (!item.learning || !isLiveMilestone(item)) return;
    const later = items.slice(index + 1).filter((next) => isLiveMilestone(next) && next.stage === "validate" && !next.learning);
    const next = later.find((n) => item.projectId && n.projectId === item.projectId) ??
      later.find((n) => n.projectId !== item.projectId);
    if (!next) return;
    item.relations.push({ type: "led_to", itemId: next.id });
    next.relations.push({ type: "followed_pivot", itemId: item.id });
  });
}

/** Groups items by project, ordered by each project's first item; items without a project come last. */
export function groupByProject(items: readonly JourneyItem[]): JourneyProjectGroup[] {
  const groups = new Map<string, JourneyProjectGroup>();
  for (const item of items) {
    const key = item.projectId ?? "";
    const group = groups.get(key) ?? { projectId: item.projectId, projectName: item.projectName, firstAt: item.occurredAt, lastAt: item.occurredAt, itemIds: [] };
    group.itemIds.push(item.id);
    group.firstAt = Math.min(group.firstAt, item.occurredAt);
    group.lastAt = Math.max(group.lastAt, item.occurredAt);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.projectId !== !b.projectId) return a.projectId ? -1 : 1;
    return a.firstAt - b.firstAt || String(a.projectId).localeCompare(String(b.projectId));
  });
}

/** Months (`YYYY-MM`, local) that actually contain items. Months without a record are never invented. */
export function journeyMonths(items: readonly JourneyItem[]): string[] {
  return [...new Set(items.map((item) => item.localDate.slice(0, 7)))].sort();
}

/**
 * What another viewer may see: verified, public, non-superseded milestones, without summaries or
 * private links. Evidence, rank and badge rows stay private here; public surfaces read them elsewhere.
 */
export function publicJourneyItems(items: readonly JourneyItem[]): JourneyItem[] {
  return items
    .filter((item) => isLiveMilestone(item) && item.visibility === "public")
    .map((item) => ({ ...item, summary: null, links: [], relations: item.relations.filter((r) => r.type === "led_to" || r.type === "followed_pivot") }));
}

export interface JourneyPage {
  items: JourneyItem[];
  nextCursor: string | null;
}

/** Keyset page over the ordered journey (oldest first), using the shared `{ at, id }` cursor. */
export function paginateJourney(items: readonly JourneyItem[], { cursor, limit, projectId }: { cursor: Cursor | null; limit: number; projectId?: string | null }): JourneyPage {
  if (limit < 1) throw new BuilderApiError(400, "invalid_limit", "limit must be at least 1");
  const filtered = projectId ? items.filter((item) => item.projectId === projectId) : items;
  const start = cursor ? filtered.findIndex((item) => compareJourneyItems(item, { occurredAt: cursor.at, id: cursor.id }) > 0) : 0;
  const from = start < 0 ? filtered.length : start;
  const page = filtered.slice(from, from + limit);
  const last = page[page.length - 1];
  const more = from + limit < filtered.length;
  return { items: page, nextCursor: more && last ? encodeCursor({ at: last.occurredAt, id: last.id }) : null };
}
