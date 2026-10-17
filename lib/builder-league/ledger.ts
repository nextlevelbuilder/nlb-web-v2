/**
 * The RP ledger. One append-only `score_ledger` fed by append-only `builder_events`; nothing here
 * updates or deletes a row of either table.
 *
 * Idempotency and concurrency on D1 (no interactive transactions):
 * - Every event and every ledger entry carries a unique dedupe key,
 *   `sha256(source|externalEventId|subjectUserId|awardType)`. Event inserts use
 *   `ON CONFLICT DO NOTHING`, so webhook retries and replays are no-ops.
 * - An award writes its ledger row and one `score_cap_slots` row per cap rule in a single `db.batch`,
 *   which D1 runs atomically. Slot keys are deterministic (`user|type|scope|window|index`), so two
 *   concurrent awards competing for the same capped slot collide on the slot's primary key and only
 *   one batch commits; the loser re-reads and takes the next free slot or stops at the cap. Two
 *   concurrent awards of the same event collide on the ledger dedupe key. Neither can double-award.
 * - Residual race: the cap read and the batch are separate round trips, so a loser may retry. Retries
 *   are bounded (`MAX_AWARD_ATTEMPTS`); persistent contention surfaces as a 409, never as an over-award.
 *   Slots of a reversed entry are released in the reversal batch, so a reversal frees cap capacity.
 */
import { and, desc, eq, gte, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { createHash } from "crypto";
import type { AppDb } from "@/lib/db";
import { builderEvents, scoreCapSlots, scoreLedger } from "@/lib/db/schema";
import {
  AWARDING_ROLES,
  STAGES,
  isEventTypeKey,
  type ActorRole,
  type BuilderEventKind,
  type BuilderEventPayload,
  type EventSource,
  type EventTypeKey,
  type Stage,
  type Verification,
  type Visibility,
} from "./types";
import { getEffectiveRuleset, getRuleset, meetsVerification, type CapRule } from "./ruleset";
import { applyCaps, capSlotPrefix } from "./scoring";
import { moderationActionInsert } from "./audit";
import { BuilderApiError, encodeCursor, type Cursor } from "./http";

export type BuilderEvent = typeof builderEvents.$inferSelect;
export type ScoreLedgerEntry = typeof scoreLedger.$inferSelect;

const MAX_AWARD_ATTEMPTS = 8;
/** Events may not claim to have happened in the future (small allowance for clock skew). */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/** `sha256(source|externalEventId|subjectUserId|awardType)`, hex. */
export function builderDedupeKey(source: string, externalEventId: string, subjectUserId: string, awardType: string): string {
  return createHash("sha256").update([source, externalEventId, subjectUserId, awardType].join("|")).digest("hex");
}

function isUniqueViolation(err: unknown): boolean {
  for (let current: unknown = err, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error && /UNIQUE constraint failed/i.test(current.message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

async function runBatch(db: AppDb, statements: BatchItem<"sqlite">[]): Promise<void> {
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface RecordBuilderEventInput {
  kind?: BuilderEventKind;
  subjectUserId: string;
  actorUserId?: string | null;
  actorRole: ActorRole;
  projectId?: string | null;
  /** Defaults to the stage of `eventType` in the event's ruleset; required for types the ruleset lacks. */
  stage?: Stage;
  eventType: EventTypeKey | (string & {});
  source: EventSource;
  /** Stable id of the source fact (evidence id, Discord message id, webhook id, …). */
  externalEventId: string;
  occurredAt: Date;
  receivedAt?: Date;
  /** Defaults to the ruleset in force at `occurredAt`. */
  rulesetVersion?: string;
  verification: Verification;
  visibility?: Visibility;
  evidenceId?: string | null;
  supersedesEventId?: string | null;
  payload?: BuilderEventPayload;
  provenance?: Record<string, unknown>;
}

const SUBMIT_ONLY_ROLES: readonly ActorRole[] = ["api", "agent"];

function assertMayRecord(input: RecordBuilderEventInput): void {
  const kind = input.kind ?? "activity";
  if (SUBMIT_ONLY_ROLES.includes(input.actorRole) || input.source === "api" || input.source === "agent") {
    // API keys and agents may submit activity, never attest verification or issue other kinds.
    if (input.verification !== "self_reported" || kind !== "activity") {
      throw new BuilderApiError(403, "verification_not_allowed", "API and agent callers can only submit self-reported activity.");
    }
  }
  if (input.actorRole === "member" && !["self_reported", "peer_confirmed"].includes(input.verification)) {
    throw new BuilderApiError(403, "verification_not_allowed", "Members cannot verify their own events.");
  }
  if (input.actorRole === "member" && kind !== "activity") {
    throw new BuilderApiError(403, "kind_not_allowed", "Members can only record activity events.");
  }
}

/**
 * Appends one event. Replays with the same `source|externalEventId|subjectUserId|eventType` return the
 * stored row with `created: false` and change nothing.
 */
export async function recordBuilderEvent(
  db: AppDb,
  input: RecordBuilderEventInput
): Promise<{ event: BuilderEvent; created: boolean }> {
  assertMayRecord(input);
  if (!input.externalEventId.trim()) throw new BuilderApiError(400, "external_event_id_required", "externalEventId is required.");
  if (input.occurredAt.getTime() > Date.now() + FUTURE_SKEW_MS) {
    throw new BuilderApiError(400, "occurred_in_future", "occurredAt cannot be in the future.");
  }
  const ruleset = input.rulesetVersion ? getRuleset(input.rulesetVersion) : getEffectiveRuleset(input.occurredAt);
  const definition = isEventTypeKey(input.eventType) ? ruleset.events[input.eventType] : undefined;
  if (definition && input.stage && input.stage !== definition.stage) {
    throw new BuilderApiError(400, "stage_mismatch", `${input.eventType} belongs to stage ${definition.stage}.`);
  }
  const stage = input.stage ?? definition?.stage;
  if (!stage) throw new BuilderApiError(400, "stage_required", `Stage is required for event type ${input.eventType}.`);

  const dedupeKey = builderDedupeKey(input.source, input.externalEventId, input.subjectUserId, input.eventType);
  const inserted = await db
    .insert(builderEvents)
    .values({
      id: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      kind: input.kind ?? "activity",
      subjectUserId: input.subjectUserId,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole,
      projectId: input.projectId ?? null,
      stage,
      eventType: input.eventType,
      source: input.source,
      externalEventId: input.externalEventId,
      dedupeKey,
      occurredAt: input.occurredAt,
      receivedAt: input.receivedAt ?? new Date(),
      rulesetVersion: ruleset.version,
      verification: input.verification,
      visibility: input.visibility ?? "private",
      evidenceId: input.evidenceId ?? null,
      supersedesEventId: input.supersedesEventId ?? null,
      payload: input.payload ?? {},
      provenance: input.provenance ?? {},
    })
    .onConflictDoNothing({ target: builderEvents.dedupeKey })
    .returning();
  if (inserted.length > 0) return { event: inserted[0], created: true };
  const [existing] = await db.select().from(builderEvents).where(eq(builderEvents.dedupeKey, dedupeKey)).limit(1);
  return { event: existing, created: false };
}

/** Looks an event up by its row id or its public `event_id`. */
export async function getBuilderEvent(db: AppDb, eventId: string): Promise<BuilderEvent | null> {
  const [event] = await db
    .select()
    .from(builderEvents)
    .where(or(eq(builderEvents.id, eventId), eq(builderEvents.eventId, eventId)))
    .limit(1);
  return event ?? null;
}

// ---------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------

export interface AwardActor {
  actorId: string;
  actorRole: ActorRole;
}

export type AwardSkipReason =
  | "event_not_found"
  | "not_awardable_kind"
  | "unknown_event_type"
  | "insufficient_verification"
  | "project_required"
  | "invalid_adjustment"
  | (string & {});

export type AwardResult =
  | { entry: ScoreLedgerEntry; created: boolean; reason: null }
  | { entry: null; created: false; reason: AwardSkipReason };

const skip = (reason: AwardSkipReason): AwardResult => ({ entry: null, created: false, reason });
const AWARDABLE_KINDS: readonly BuilderEventKind[] = ["activity", "backfill", "correction", "adjustment"];
const PROJECT_STAGES: readonly Stage[] = ["validate", "build", "ship"];

interface AwardPlan {
  awardType: string;
  rp: number;
  dedupeKey: string;
  capRules: CapRule[];
}

function planAward(event: BuilderEvent, actor: AwardActor): AwardPlan | AwardSkipReason {
  if (!AWARDABLE_KINDS.includes(event.kind)) return "not_awardable_kind";
  if (event.kind === "adjustment") {
    // Manual score adjustments are admin-only, signed and uncapped; they are audited by the caller.
    const rp = event.payload?.rp;
    if (actor.actorRole !== "admin" || typeof rp !== "number" || !Number.isInteger(rp) || rp === 0) return "invalid_adjustment";
    return {
      awardType: "adjustment",
      rp,
      dedupeKey: builderDedupeKey(event.source, event.externalEventId, event.subjectUserId, "adjustment"),
      capRules: [],
    };
  }
  const ruleset = getRuleset(event.rulesetVersion);
  const definition = isEventTypeKey(event.eventType) ? ruleset.events[event.eventType] : undefined;
  if (!definition) return "unknown_event_type";
  if (!meetsVerification(event.verification, definition.requiredVerification)) return "insufficient_verification";
  if (PROJECT_STAGES.includes(definition.stage) && !event.projectId) return "project_required";
  const dedupeKey =
    definition.dedupeScope === "project"
      ? builderDedupeKey("project", event.projectId!, event.subjectUserId, definition.key)
      : builderDedupeKey(event.source, event.externalEventId, event.subjectUserId, definition.key);
  return { awardType: definition.key, rp: definition.rp, dedupeKey, capRules: definition.caps };
}

async function takenSlots(db: AppDb, userId: string, prefixes: string[]): Promise<Set<string>> {
  if (prefixes.length === 0) return new Set();
  const matches: SQL[] = prefixes.map((prefix) => sql`substr(${scoreCapSlots.slotKey}, 1, ${prefix.length}) = ${prefix}`);
  const rows = await db
    .select({ slotKey: scoreCapSlots.slotKey })
    .from(scoreCapSlots)
    .where(and(eq(scoreCapSlots.userId, userId), or(...matches)));
  return new Set(rows.map((row) => row.slotKey));
}

async function findEntryByDedupe(db: AppDb, dedupeKey: string): Promise<ScoreLedgerEntry | null> {
  const [entry] = await db.select().from(scoreLedger).where(eq(scoreLedger.dedupeKey, dedupeKey)).limit(1);
  return entry ?? null;
}

/**
 * Turns a verified event into RP, or explains why not. Only moderators, admins and the system may
 * award; API keys, agents and members never can. Replays return the existing entry (`created: false`).
 */
export async function awardForEventDetailed(db: AppDb, eventId: string, actor: AwardActor): Promise<AwardResult> {
  if (!AWARDING_ROLES.includes(actor.actorRole)) {
    throw new BuilderApiError(403, "award_not_allowed", "Only moderators, admins and the system can award RP.");
  }
  const event = await getBuilderEvent(db, eventId);
  if (!event) return skip("event_not_found");
  const plan = planAward(event, actor);
  if (typeof plan === "string") return skip(plan);

  const candidate = {
    userId: event.subjectUserId,
    eventType: event.eventType as EventTypeKey,
    occurredAt: event.occurredAt,
    projectId: event.projectId,
    counterpartyUserId: typeof event.payload?.counterpartyUserId === "string" ? event.payload.counterpartyUserId : null,
  };
  const prefixes = plan.capRules.map((rule) => capSlotPrefix(rule, candidate)).filter((p): p is string => p !== null);

  for (let attempt = 0; attempt < MAX_AWARD_ATTEMPTS; attempt++) {
    const existing = await findEntryByDedupe(db, plan.dedupeKey);
    if (existing) return { entry: existing, created: false, reason: null };

    let slotKeys: string[] = [];
    if (plan.capRules.length > 0) {
      const decision = applyCaps(candidate, [], getRuleset(event.rulesetVersion), await takenSlots(db, event.subjectUserId, prefixes));
      if (!decision.allowed) return skip(decision.reason);
      slotKeys = decision.slotKeys;
    }

    const entryId = crypto.randomUUID();
    const now = new Date();
    const statements: BatchItem<"sqlite">[] = [
      db.insert(scoreLedger).values({
        id: entryId,
        userId: event.subjectUserId,
        eventId: event.id,
        awardType: plan.awardType,
        stage: event.stage,
        rp: plan.rp,
        rulesetVersion: event.rulesetVersion,
        dedupeKey: plan.dedupeKey,
        reversesEntryId: null,
        reason: `awarded_by:${actor.actorRole}:${actor.actorId}`,
        occurredAt: event.occurredAt,
        createdAt: now,
      }),
      ...slotKeys.map((slotKey) =>
        db.insert(scoreCapSlots).values({ slotKey, userId: event.subjectUserId, entryId, createdAt: now })
      ),
    ];
    try {
      await runBatch(db, statements);
    } catch (err) {
      if (isUniqueViolation(err)) continue; // lost a race on the dedupe key or a cap slot: re-read
      throw err;
    }
    const [entry] = await db.select().from(scoreLedger).where(eq(scoreLedger.id, entryId)).limit(1);
    return { entry, created: true, reason: null };
  }
  throw new BuilderApiError(409, "award_contention", "The award could not be committed because of concurrent awards. Retry.");
}

/** Contract wrapper: the ledger entry (new or replayed), or null when skipped (cap, verification, …). */
export async function awardForEvent(
  db: AppDb,
  eventId: string,
  actor: AwardActor
): Promise<(ScoreLedgerEntry & { created: boolean }) | null> {
  const result = await awardForEventDetailed(db, eventId, actor);
  return result.entry ? { ...result.entry, created: result.created } : null;
}

// ---------------------------------------------------------------------------
// Reversals
// ---------------------------------------------------------------------------

export interface ReverseActor {
  actorId: string;
  reason: string;
  actorRole?: ActorRole;
}

/**
 * Reverses an award by appending a `reversal` event and a negative ledger entry; the original rows are
 * never touched. Idempotent: reversing the same entry again returns the existing reversal entry. The
 * reversal entry keeps the original `occurred_at`, so period totals of the original period net out,
 * and it releases the entry's cap slots. The moderator audit row is written in the same batch.
 */
export async function reverseAward(db: AppDb, entryId: string, actor: ReverseActor): Promise<ScoreLedgerEntry> {
  const actorRole = actor.actorRole ?? "moderator";
  if (!AWARDING_ROLES.includes(actorRole)) {
    throw new BuilderApiError(403, "reverse_not_allowed", "Only moderators, admins and the system can reverse RP.");
  }
  if (!actor.reason.trim()) throw new BuilderApiError(400, "reason_required", "A reversal needs a reason.");
  const [original] = await db.select().from(scoreLedger).where(eq(scoreLedger.id, entryId)).limit(1);
  if (!original) throw new BuilderApiError(404, "entry_not_found", "Ledger entry not found.");
  if (original.reversesEntryId) throw new BuilderApiError(400, "cannot_reverse_reversal", "A reversal cannot be reversed.");

  const dedupeKey = builderDedupeKey("reversal", original.id, original.userId, original.awardType);
  const existing = await findEntryByDedupe(db, dedupeKey);
  if (existing) return existing;

  const originalEvent = await getBuilderEvent(db, original.eventId);
  const { event } = await recordBuilderEvent(db, {
    kind: "reversal",
    subjectUserId: original.userId,
    actorUserId: actor.actorId,
    actorRole,
    projectId: originalEvent?.projectId ?? null,
    stage: original.stage,
    eventType: original.awardType,
    source: actorRole === "system" ? "system" : "moderator",
    externalEventId: `reversal:${original.id}`,
    occurredAt: new Date(),
    rulesetVersion: original.rulesetVersion,
    verification: actorRole === "system" ? "system_verified" : "moderator_verified",
    supersedesEventId: original.eventId,
    payload: { note: actor.reason, reversesEntryId: original.id },
  });

  const reversalId = crypto.randomUUID();
  try {
    await runBatch(db, [
      db.insert(scoreLedger).values({
        id: reversalId,
        userId: original.userId,
        eventId: event.id,
        awardType: original.awardType,
        stage: original.stage,
        rp: -original.rp,
        rulesetVersion: original.rulesetVersion,
        dedupeKey,
        reversesEntryId: original.id,
        reason: actor.reason,
        occurredAt: original.occurredAt,
        createdAt: new Date(),
      }),
      db.delete(scoreCapSlots).where(eq(scoreCapSlots.entryId, original.id)),
      moderationActionInsert(db, {
        targetType: "ledger_entry",
        targetId: original.id,
        action: "reverse",
        actorId: actor.actorId,
        actorRole,
        reasonCodes: ["reversal"],
        notes: actor.reason,
      }),
    ]);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const concurrent = await findEntryByDedupe(db, dedupeKey);
    if (concurrent) return concurrent;
    throw err;
  }
  const [entry] = await db.select().from(scoreLedger).where(eq(scoreLedger.id, reversalId)).limit(1);
  return entry;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface LedgerQuery {
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: Cursor | null;
}

/** Newest first, keyset-paginated on (`occurred_at`, `id`). */
export async function getLedger(
  db: AppDb,
  userId: string,
  { from, to, limit = 50, cursor }: LedgerQuery = {}
): Promise<{ items: ScoreLedgerEntry[]; nextCursor: string | null }> {
  const pageSize = Math.min(Math.max(limit, 1), 200);
  const conditions: SQL[] = [eq(scoreLedger.userId, userId)];
  if (from) conditions.push(gte(scoreLedger.occurredAt, from));
  if (to) conditions.push(lte(scoreLedger.occurredAt, to));
  if (cursor) {
    const at = new Date(cursor.at);
    conditions.push(or(lt(scoreLedger.occurredAt, at), and(eq(scoreLedger.occurredAt, at), lt(scoreLedger.id, cursor.id)))!);
  }
  const rows = await db
    .select()
    .from(scoreLedger)
    .where(and(...conditions))
    .orderBy(desc(scoreLedger.occurredAt), desc(scoreLedger.id))
    .limit(pageSize + 1);
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > pageSize && last ? encodeCursor({ at: last.occurredAt.getTime(), id: last.id }) : null,
  };
}

/** Lifetime RP: the sum of every entry, reversals included. */
export async function getRpTotal(db: AppDb, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${scoreLedger.rp}), 0)` })
    .from(scoreLedger)
    .where(eq(scoreLedger.userId, userId));
  return Number(row?.total ?? 0);
}

/** Net RP per stage, optionally limited to an inclusive `occurred_at` range. */
export async function getStageTotals(
  db: AppDb,
  userId: string,
  range?: { from?: Date; to?: Date }
): Promise<Record<Stage, number>> {
  const conditions: SQL[] = [eq(scoreLedger.userId, userId)];
  if (range?.from) conditions.push(gte(scoreLedger.occurredAt, range.from));
  if (range?.to) conditions.push(lte(scoreLedger.occurredAt, range.to));
  const rows = await db
    .select({ stage: scoreLedger.stage, total: sql<number>`coalesce(sum(${scoreLedger.rp}), 0)` })
    .from(scoreLedger)
    .where(and(...conditions))
    .groupBy(scoreLedger.stage);
  const totals = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
  for (const row of rows) totals[row.stage] = Number(row.total);
  return totals;
}
