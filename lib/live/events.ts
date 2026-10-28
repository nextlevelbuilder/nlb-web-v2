import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { changesOf, runRawBatch } from "./live-d1-batch";
import { liveEvents, livePollRounds, liveTopics } from "@/lib/db/schema";
import { LIVE_TIMEZONE } from "./types";
import { LiveError, liveInvalid, liveNotFound } from "./live-errors";
import { assertTransition } from "./event-lifecycle";
import { optionalId, optionalText, requireDate, requireInt, requireSlug, requireText, withUniqueConflict } from "./live-validation";

/**
 * Operator management of events: drafts, edits, opening sales and capacity. Callers are already
 * authorized. Price and currency are locked once a Polar product exists (the product price is
 * what Polar charges); capacity only grows once sales are open, so a sold seat is never removed.
 */
export type LiveEventRow = typeof liveEvents.$inferSelect;

export const MAX_EVENT_CAPACITY = 10_000;

export interface EventEditableFields {
  titleEn: string;
  titleVi: string;
  descriptionEn?: string;
  descriptionVi?: string;
  topicId?: string | null;
  pollRoundId?: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone?: string;
  hostName: string;
  capacity: number;
  priceCents: number;
  currency?: string;
  premiumDiscountId?: string | null;
  vipDiscountId?: string | null;
  refundPolicyEn?: string;
  refundPolicyVi?: string;
  recordingNoticeEn?: string;
  recordingNoticeVi?: string;
}

export interface CreateEventInput extends EventEditableFields {
  slug: string;
  createdBy: string;
}

type EventSet = Partial<typeof liveEvents.$inferInsert>;

/** Validate the fields present in `input` (all of them for a create). */
function validateFields(input: Partial<EventEditableFields>): EventSet {
  const set: EventSet = {};
  if (input.titleEn !== undefined) set.titleEn = requireText(input.titleEn, "titleEn");
  if (input.titleVi !== undefined) set.titleVi = requireText(input.titleVi, "titleVi");
  if (input.descriptionEn !== undefined) set.descriptionEn = optionalText(input.descriptionEn, "descriptionEn", 10_000);
  if (input.descriptionVi !== undefined) set.descriptionVi = optionalText(input.descriptionVi, "descriptionVi", 10_000);
  if (input.topicId !== undefined) set.topicId = optionalId(input.topicId, "topicId");
  if (input.pollRoundId !== undefined) set.pollRoundId = optionalId(input.pollRoundId, "pollRoundId");
  if (input.startsAt !== undefined) set.startsAt = requireDate(input.startsAt, "startsAt");
  if (input.endsAt !== undefined) set.endsAt = requireDate(input.endsAt, "endsAt");
  if (input.timezone !== undefined) set.timezone = requireText(input.timezone, "timezone", 64);
  if (input.hostName !== undefined) set.hostName = requireText(input.hostName, "hostName");
  if (input.capacity !== undefined) set.capacity = requireInt(input.capacity, "capacity", 1, MAX_EVENT_CAPACITY);
  if (input.priceCents !== undefined) set.priceCents = requireInt(input.priceCents, "priceCents", 1, 100_000_000);
  if (input.currency !== undefined) {
    if (typeof input.currency !== "string" || !/^[a-z]{3}$/.test(input.currency)) throw liveInvalid("currency must be a lowercase ISO code");
    set.currency = input.currency;
  }
  if (input.premiumDiscountId !== undefined) set.premiumDiscountId = optionalId(input.premiumDiscountId, "premiumDiscountId");
  if (input.vipDiscountId !== undefined) set.vipDiscountId = optionalId(input.vipDiscountId, "vipDiscountId");
  if (input.refundPolicyEn !== undefined) set.refundPolicyEn = optionalText(input.refundPolicyEn, "refundPolicyEn");
  if (input.refundPolicyVi !== undefined) set.refundPolicyVi = optionalText(input.refundPolicyVi, "refundPolicyVi");
  if (input.recordingNoticeEn !== undefined) set.recordingNoticeEn = optionalText(input.recordingNoticeEn, "recordingNoticeEn");
  if (input.recordingNoticeVi !== undefined) set.recordingNoticeVi = optionalText(input.recordingNoticeVi, "recordingNoticeVi");
  return set;
}

/** A `topicId` / `pollRoundId` that points at nothing is a 400, not a foreign-key failure (500). */
async function assertReferencesExist(db: AppDb, fields: EventSet): Promise<void> {
  if (fields.topicId) {
    const [topic] = await db.select({ id: liveTopics.id }).from(liveTopics).where(eq(liveTopics.id, fields.topicId)).limit(1);
    if (!topic) throw liveInvalid("topicId does not match a topic");
  }
  if (fields.pollRoundId) {
    const [round] = await db.select({ id: livePollRounds.id }).from(livePollRounds).where(eq(livePollRounds.id, fields.pollRoundId)).limit(1);
    if (!round) throw liveInvalid("pollRoundId does not match a voting round");
  }
}

function assertTimes(startsAt: Date, endsAt: Date): void {
  if (endsAt.getTime() <= startsAt.getTime()) throw liveInvalid("endsAt must be after startsAt");
}

export async function createEventDraft(input: CreateEventInput, db: AppDb): Promise<LiveEventRow> {
  const fields = validateFields(input);
  if (!fields.titleEn || !fields.titleVi || !fields.startsAt || !fields.endsAt || !fields.hostName || !fields.capacity || !fields.priceCents) {
    throw liveInvalid("titleEn, titleVi, startsAt, endsAt, hostName, capacity and priceCents are required");
  }
  assertTimes(fields.startsAt, fields.endsAt);
  await assertReferencesExist(db, fields);
  const values = {
    ...fields,
    titleEn: fields.titleEn,
    titleVi: fields.titleVi,
    startsAt: fields.startsAt,
    endsAt: fields.endsAt,
    hostName: fields.hostName,
    capacity: fields.capacity,
    priceCents: fields.priceCents,
    timezone: fields.timezone ?? LIVE_TIMEZONE,
    slug: requireSlug(input.slug),
    status: "draft" as const,
    createdBy: requireText(input.createdBy, "createdBy"),
  };
  const [row] = await withUniqueConflict("Event", () => db.insert(liveEvents).values(values).returning());
  return row;
}

const EDITABLE_STATUSES = new Set(["draft", "scheduled", "sales_open"]);

/**
 * Edit an event. Drafts and scheduled events accept any field; once sales are open, price,
 * currency and capacity are refused here (capacity grows through `setEventCapacity`). Price and
 * currency are also refused as soon as a Polar product exists. Live, ended, cancelled and archived
 * events are read-only.
 */
export async function updateEvent(
  eventId: string,
  patch: Partial<EventEditableFields>,
  db: AppDb,
  now: Date = new Date()
): Promise<LiveEventRow> {
  const event = await loadEvent(db, eventId);
  if (!EDITABLE_STATUSES.has(event.status)) throw new LiveError(409, "event_locked", `A ${event.status} event cannot be edited`);
  const set = validateFields(patch);
  const priceChange =
    (set.priceCents !== undefined && set.priceCents !== event.priceCents) ||
    (set.currency !== undefined && set.currency !== event.currency);
  if (priceChange && (event.polarProductId || event.status === "sales_open")) {
    throw new LiveError(409, "price_locked", "Price is locked once the payment product exists");
  }
  if (event.status === "sales_open" && set.capacity !== undefined && set.capacity !== event.capacity) {
    throw new LiveError(409, "capacity_shrink_refused", "Use setEventCapacity to add seats once sales are open");
  }
  assertTimes(set.startsAt ?? event.startsAt, set.endsAt ?? event.endsAt);
  await assertReferencesExist(db, set);
  const [row] = await db
    .update(liveEvents)
    .set({ ...set, updatedAt: now })
    .where(and(eq(liveEvents.id, eventId), eq(liveEvents.status, event.status)))
    .returning();
  if (!row) throw new LiveError(409, "conflict", "The event changed while updating; retry");
  return row;
}

/**
 * One statement that inserts seat rows `1..capacity` that do not exist yet, only while the event is
 * `sales_open`. Capacity is read in the statement, so it always matches the stored value.
 */
function ensureSeatRows(db: AppDb, eventId: string, now: Date) {
  return sql`
    INSERT INTO live_seats (event_id, seat_no, state, updated_at)
    WITH RECURSIVE n(i) AS (
      SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < (SELECT capacity FROM live_events WHERE id = ${eventId})
    )
    SELECT ${eventId}, i, 'free', ${now.getTime()} FROM n
    WHERE EXISTS (SELECT 1 FROM live_events WHERE id = ${eventId} AND status = 'sales_open')
    ON CONFLICT (event_id, seat_no) DO NOTHING`;
}

/**
 * `scheduled → sales_open`: needs a Polar product and the recording notice buyers must accept.
 * The status change and `capacity` seat rows are written in one batch. Idempotent: calling it on an
 * event whose sales are already open only fills in missing seat rows.
 */
export async function openSales(eventId: string, db: AppDb, now: Date = new Date()): Promise<{ event: LiveEventRow; seatsCreated: number }> {
  const event = await loadEvent(db, eventId);
  if (event.status !== "sales_open") {
    assertTransition(event.status, "sales_open");
    if (!event.polarProductId) throw new LiveError(409, "polar_product_missing", "Create the payment product before opening sales");
    if (!event.recordingNoticeEn.trim() || !event.recordingNoticeVi.trim()) {
      throw new LiveError(409, "recording_notice_missing", "Recording notices (EN and VI) are required before opening sales");
    }
  }
  const [opened, seats] = await runRawBatch(db, [
    sql`
      UPDATE live_events SET status = 'sales_open', updated_at = ${now.getTime()}
      WHERE id = ${eventId} AND status = 'scheduled' AND polar_product_id IS NOT NULL`,
    ensureSeatRows(db, eventId, now),
  ]);
  if (event.status !== "sales_open" && changesOf(opened) !== 1) {
    throw new LiveError(409, "conflict", "The event changed while opening sales; retry");
  }
  return { event: await loadEvent(db, eventId), seatsCreated: changesOf(seats) };
}

/**
 * Set capacity. Before sales open any value from 1 is accepted. Once sales are open capacity can
 * only grow: the new seat rows are added in the same batch as the capacity change.
 */
export async function setEventCapacity(eventId: string, capacity: number, db: AppDb, now: Date = new Date()): Promise<LiveEventRow> {
  const next = requireInt(capacity, "capacity", 1, MAX_EVENT_CAPACITY);
  const event = await loadEvent(db, eventId);
  if (event.status === "draft" || event.status === "scheduled") return updateEvent(eventId, { capacity: next }, db, now);
  if (event.status !== "sales_open") throw new LiveError(409, "event_locked", `A ${event.status} event cannot change capacity`);
  if (next < event.capacity) throw new LiveError(409, "capacity_shrink_refused", "Capacity cannot shrink once sales are open");
  const [changed] = await runRawBatch(db, [
    sql`
      UPDATE live_events SET capacity = ${next}, updated_at = ${now.getTime()}
      WHERE id = ${eventId} AND status = 'sales_open' AND capacity <= ${next}`,
    ensureSeatRows(db, eventId, now),
  ]);
  if (changesOf(changed) !== 1) throw new LiveError(409, "conflict", "The event changed while updating; retry");
  return loadEvent(db, eventId);
}

export async function loadEvent(db: AppDb, eventId: string): Promise<LiveEventRow> {
  const [event] = await db.select().from(liveEvents).where(eq(liveEvents.id, eventId)).limit(1);
  if (!event) throw liveNotFound("Event");
  return event;
}
