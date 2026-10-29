/**
 * Activity evidence: what a member submits so a moderator (or, for peer help, the helped member) can
 * verify it and the ledger can award RP.
 *
 * - Every submission is validated against the event definition of the ruleset in force at `occurredAt`
 *   (stage, project, summary length, link-or-file requirement, counterparty requirement). Types that only
 *   the system can verify (weekly feedback, Discord activity) cannot be submitted.
 * - `client_key` is unique per member, so a retried submission returns the stored row instead of a copy.
 * - The source follows the caller: a session is `member`, an API key `api`, MCP delegation `agent`.
 *   Every caller can only create `submitted` evidence; approval lives in `moderation.ts`.
 * - Private by default: visibility starts `private`, the schema has no field for customer contact data,
 *   unknown fields are rejected, and files live in a private bucket (`evidence-storage.ts`).
 * - Members may edit or withdraw while the evidence is `submitted` or `needs_info`. Edits use optimistic
 *   concurrency on `updated_at`; an edit after `needs_info` sends the evidence back to the queue.
 */
import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { activityEvidence, builderModerationActions, builderProjects, evidenceAppeals, users } from "@/lib/db/schema";
import { HttpUrlSchema } from "@nextlevelbuilder/contracts";
import { BuilderApiError, encodeCursor, type Cursor } from "./http";
import { getEffectiveRuleset, type EventDefinition, type Ruleset } from "./ruleset";
import {
  EVIDENCE_STATUSES,
  STAGES,
  VISIBILITIES,
  isEventTypeKey,
  type ActorRole,
  type EventSource,
  type EvidenceStatus,
  type Stage,
} from "./types";
import { getOwnedProject } from "./projects";
import {
  deleteEvidenceFiles,
  evidenceFileName,
  getEvidenceBucket,
  putEvidenceFiles,
  validateEvidenceFiles,
  type EvidenceBucket,
} from "./evidence-storage";

export type Evidence = typeof activityEvidence.$inferSelect;
export type EvidenceAppeal = typeof evidenceAppeals.$inferSelect;

/** Statuses in which the member may still edit or withdraw, and a moderator may decide. */
export const OPEN_EVIDENCE_STATUSES = ["submitted", "needs_info"] as const satisfies readonly EvidenceStatus[];

/** Oldest date evidence may claim (the first ruleset's effective date). */
export const EARLIEST_OCCURRED_AT = Date.parse("2025-01-01T00:00:00+07:00");
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const CLIENT_KEY_RE = /^[\x21-\x7e]{1,128}$/;
const MAX_LINKS = 10;

// ---------------------------------------------------------------------------
// Ruleset lookups
// ---------------------------------------------------------------------------

/** Event types a member (or their API key / agent) may submit: everything a human can verify. */
export function submittableDefinitions(ruleset: Ruleset): EventDefinition[] {
  return Object.values(ruleset.events).filter(
    (definition): definition is EventDefinition => Boolean(definition) && definition!.requiredVerification !== "system_verified"
  );
}

export function getSubmittableDefinition(eventType: string, occurredAt: Date): { ruleset: Ruleset; definition: EventDefinition } {
  const ruleset = getEffectiveRuleset(occurredAt);
  const definition = isEventTypeKey(eventType) ? ruleset.events[eventType] : undefined;
  if (!definition) {
    throw new BuilderApiError(400, "unknown_event_type", `Event type ${eventType} is not part of ruleset ${ruleset.version} in force on that date.`, {
      rulesetVersion: ruleset.version,
    });
  }
  if (definition.requiredVerification === "system_verified") {
    throw new BuilderApiError(400, "event_type_not_submittable", `${eventType} is recorded automatically and cannot be submitted.`);
  }
  return { ruleset, definition };
}

/** Project-scored stages; CONTRIBUTE evidence may stand alone. */
export function stageNeedsProject(stage: Stage): boolean {
  return stage !== "contribute";
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` is a local (Asia/Ho_Chi_Minh) calendar date; anything else must be an ISO instant. */
export function parseOccurredAt(value: string | number | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return Number.isFinite(value) ? new Date(value) : null;
  const trimmed = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? Date.parse(`${trimmed}T00:00:00+07:00`) : Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

const OccurredAtSchema = z.union([z.string().max(40), z.number(), z.date()]).transform((value, ctx) => {
  const date = parseOccurredAt(value);
  if (!date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "occurredAt must be a date (YYYY-MM-DD) or an ISO timestamp." });
    return z.NEVER;
  }
  if (date.getTime() > Date.now() + FUTURE_SKEW_MS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "occurredAt cannot be in the future." });
    return z.NEVER;
  }
  if (date.getTime() < EARLIEST_OCCURRED_AT) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "occurredAt is before the first Builder League ruleset." });
    return z.NEVER;
  }
  return date;
});

const LinksSchema = z.array(HttpUrlSchema.max(2048)).max(MAX_LINKS);
const OptionalId = z
  .string()
  .trim()
  .max(300)
  .nullish()
  .transform((value) => value || null);

export const SubmitEvidenceSchema = z
  .object({
    eventType: z.string().trim().min(1).max(64),
    stage: z.enum(STAGES).optional(),
    projectId: OptionalId,
    title: z.string().trim().min(3).max(140),
    summary: z.string().trim().max(5000).default(""),
    occurredAt: OccurredAtSchema,
    links: LinksSchema.default([]),
    /** User id or `/builders/{id}` profile URL of the helped member or confirming counterparty. */
    counterparty: OptionalId,
    visibility: z.enum(VISIBILITIES).default("private"),
    clientKey: z.string().regex(CLIENT_KEY_RE, "clientKey must be 1-128 visible ASCII characters.").optional(),
  })
  .strict();
export type SubmitEvidenceInput = z.input<typeof SubmitEvidenceSchema>;

export const EditEvidenceSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    summary: z.string().trim().max(5000),
    occurredAt: OccurredAtSchema,
    links: LinksSchema,
    projectId: OptionalId,
    counterparty: OptionalId,
    visibility: z.enum(VISIBILITIES),
    /** File names (as listed in `files`) to delete. */
    removeFiles: z.array(z.string().max(64)).max(10),
  })
  .partial()
  .strict();
export type EditEvidenceInput = z.input<typeof EditEvidenceSchema>;

// ---------------------------------------------------------------------------
// Validation shared by submit and edit
// ---------------------------------------------------------------------------

/** Accepts a raw user id or any URL/path containing `/builders/{id}`. */
export function parseCounterpartyReference(value: string): string {
  const match = /\/builders\/([^/?#\s]+)/.exec(value);
  return decodeURIComponent(match ? match[1] : value).trim();
}

async function resolveCounterparty(db: AppDb, userId: string, reference: string | null): Promise<string | null> {
  if (!reference) return null;
  const counterpartyId = parseCounterpartyReference(reference);
  if (counterpartyId === userId) throw new BuilderApiError(400, "self_counterparty", "You cannot name yourself as the counterparty.");
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, counterpartyId)).limit(1);
  if (!user) throw new BuilderApiError(400, "counterparty_not_found", "The counterparty is not a known member.");
  return user.id;
}

interface EvidenceDraft {
  eventType: string;
  stage?: Stage;
  projectId: string | null;
  summary: string;
  occurredAt: Date;
  linkCount: number;
  fileCount: number;
  counterpartyUserId: string | null;
}

/** Checks a complete draft against its event definition; returns the definition and stage. */
async function validateDraft(db: AppDb, userId: string, draft: EvidenceDraft): Promise<{ definition: EventDefinition; ruleset: Ruleset }> {
  const { definition, ruleset } = getSubmittableDefinition(draft.eventType, draft.occurredAt);
  if (draft.stage && draft.stage !== definition.stage) {
    throw new BuilderApiError(400, "stage_mismatch", `${definition.key} belongs to stage ${definition.stage}.`);
  }
  if (draft.projectId) {
    if (!(await getOwnedProject(db, userId, draft.projectId))) {
      throw new BuilderApiError(400, "project_not_found", "Choose one of your active projects.");
    }
  } else if (stageNeedsProject(definition.stage)) {
    throw new BuilderApiError(400, "project_required", `${definition.stage.toUpperCase()} evidence must belong to a project.`);
  }
  if (draft.summary.length < definition.evidence.minSummaryLength) {
    throw new BuilderApiError(400, "summary_too_short", `The summary needs at least ${definition.evidence.minSummaryLength} characters.`, {
      minSummaryLength: definition.evidence.minSummaryLength,
    });
  }
  if (definition.evidence.linkRequired && draft.linkCount + draft.fileCount === 0) {
    throw new BuilderApiError(400, "link_required", "Add at least one link or file as proof.");
  }
  if (definition.evidence.counterpartyConfirmation && !draft.counterpartyUserId) {
    throw new BuilderApiError(400, "counterparty_required", "Name the member who will confirm this.");
  }
  return { definition, ruleset };
}

export function sourceForActor(actorRole: ActorRole): EventSource {
  if (actorRole === "api") return "api";
  if (actorRole === "agent") return "agent";
  return "member";
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export interface EvidenceActor {
  userId: string;
  actorRole: ActorRole;
}

export interface SubmitEvidenceOptions {
  files?: File[];
  /** Fallback idempotency key (the `Idempotency-Key` header) when the body has no `clientKey`. */
  idempotencyKey?: string | null;
  bucket?: EvidenceBucket;
}

async function findByClientKey(db: AppDb, userId: string, clientKey: string): Promise<Evidence | null> {
  const [row] = await db
    .select()
    .from(activityEvidence)
    .where(and(eq(activityEvidence.userId, userId), eq(activityEvidence.clientKey, clientKey)))
    .limit(1);
  return row ?? null;
}

export async function submitEvidence(
  db: AppDb,
  actor: EvidenceActor,
  input: unknown,
  options: SubmitEvidenceOptions = {}
): Promise<{ evidence: Evidence; created: boolean }> {
  const parsed = SubmitEvidenceSchema.parse(input);
  const fallbackKey = options.idempotencyKey && CLIENT_KEY_RE.test(options.idempotencyKey) ? options.idempotencyKey : null;
  const clientKey = parsed.clientKey ?? fallbackKey ?? crypto.randomUUID();

  const replay = await findByClientKey(db, actor.userId, clientKey);
  if (replay) return { evidence: replay, created: false };

  const files = options.files ?? [];
  const counterpartyUserId = await resolveCounterparty(db, actor.userId, parsed.counterparty);
  const { definition } = await validateDraft(db, actor.userId, {
    eventType: parsed.eventType,
    stage: parsed.stage,
    projectId: parsed.projectId,
    summary: parsed.summary,
    occurredAt: parsed.occurredAt,
    linkCount: parsed.links.length,
    fileCount: files.length,
    counterpartyUserId,
  });
  const validatedFiles = await validateEvidenceFiles(files);

  const id = crypto.randomUUID();
  const bucket = validatedFiles.length > 0 ? (options.bucket ?? getEvidenceBucket()) : null;
  const keys = bucket ? await putEvidenceFiles(bucket, actor.userId, id, validatedFiles) : [];
  const now = new Date();
  let inserted: Evidence[];
  try {
    inserted = await db
      .insert(activityEvidence)
      .values({
        id,
        userId: actor.userId,
        projectId: parsed.projectId,
        eventType: definition.key,
        stage: definition.stage,
        title: parsed.title,
        summary: parsed.summary,
        occurredAt: parsed.occurredAt,
        links: parsed.links,
        privateObjectKeys: keys,
        counterpartyUserId,
        counterpartyConfirmedAt: null,
        status: "submitted",
        source: sourceForActor(actor.actorRole),
        visibility: parsed.visibility,
        clientKey,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: [activityEvidence.userId, activityEvidence.clientKey] })
      .returning();
  } catch (err) {
    if (bucket) await deleteEvidenceFiles(bucket, keys);
    throw err;
  }
  if (inserted.length > 0) return { evidence: inserted[0], created: true };
  // A concurrent retry with the same client key won: keep its row, drop our files.
  if (bucket) await deleteEvidenceFiles(bucket, keys);
  const existing = await findByClientKey(db, actor.userId, clientKey);
  if (!existing) throw new BuilderApiError(409, "submission_conflict", "The submission could not be stored. Retry.");
  return { evidence: existing, created: false };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getEvidence(db: AppDb, evidenceId: string): Promise<Evidence | null> {
  const [row] = await db.select().from(activityEvidence).where(eq(activityEvidence.id, evidenceId)).limit(1);
  return row ?? null;
}

export type EvidenceViewerRole = "owner" | "admin" | "counterparty";

/**
 * The evidence and how the viewer relates to it. Anyone else gets a 404, so ids cannot be probed.
 * The counterparty may read it (to confirm) but never sees private files.
 */
export async function getEvidenceForViewer(
  db: AppDb,
  evidenceId: string,
  viewer: { id: string; isAdmin: boolean }
): Promise<{ evidence: Evidence; role: EvidenceViewerRole }> {
  const evidence = await getEvidence(db, evidenceId);
  if (evidence) {
    if (evidence.userId === viewer.id) return { evidence, role: "owner" };
    if (viewer.isAdmin) return { evidence, role: "admin" };
    if (evidence.counterpartyUserId === viewer.id) return { evidence, role: "counterparty" };
  }
  throw new BuilderApiError(404, "not_found", "Evidence not found.");
}

export interface EvidenceListQuery {
  status?: EvidenceStatus;
  limit?: number;
  cursor?: Cursor | null;
}

/** The member's own evidence, newest first, keyset-paginated on (`created_at`, `id`). */
export async function listOwnEvidence(
  db: AppDb,
  userId: string,
  { status, limit = 20, cursor }: EvidenceListQuery = {}
): Promise<{ items: Evidence[]; nextCursor: string | null }> {
  const pageSize = Math.min(Math.max(limit, 1), 100);
  const conditions: SQL[] = [eq(activityEvidence.userId, userId)];
  if (status) conditions.push(eq(activityEvidence.status, status));
  if (cursor) {
    const at = new Date(cursor.at);
    conditions.push(or(lt(activityEvidence.createdAt, at), and(eq(activityEvidence.createdAt, at), lt(activityEvidence.id, cursor.id)))!);
  }
  const rows = await db
    .select()
    .from(activityEvidence)
    .where(and(...conditions))
    .orderBy(desc(activityEvidence.createdAt), desc(activityEvidence.id))
    .limit(pageSize + 1);
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > pageSize && last ? encodeCursor({ at: last.createdAt.getTime(), id: last.id }) : null };
}

/** Open evidence that names the user as counterparty and still waits for their confirmation. */
export async function listConfirmationRequests(db: AppDb, userId: string) {
  return db
    .select({ evidence: activityEvidence, helperName: users.name })
    .from(activityEvidence)
    .innerJoin(users, eq(users.id, activityEvidence.userId))
    .where(
      and(
        eq(activityEvidence.counterpartyUserId, userId),
        isNull(activityEvidence.counterpartyConfirmedAt),
        inArray(activityEvidence.status, [...OPEN_EVIDENCE_STATUSES])
      )
    )
    .orderBy(desc(activityEvidence.createdAt))
    .limit(50);
}

/** Latest appeal per evidence id. */
export async function latestAppeals(db: AppDb, evidenceIds: string[]): Promise<Map<string, EvidenceAppeal>> {
  const map = new Map<string, EvidenceAppeal>();
  if (evidenceIds.length === 0) return map;
  const rows = await db
    .select()
    .from(evidenceAppeals)
    .where(inArray(evidenceAppeals.evidenceId, evidenceIds))
    .orderBy(desc(evidenceAppeals.createdAt));
  for (const row of rows) if (!map.has(row.evidenceId)) map.set(row.evidenceId, row);
  return map;
}

export async function projectNames(db: AppDb, projectIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(projectIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: builderProjects.id, name: builderProjects.name }).from(builderProjects).where(inArray(builderProjects.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

// ---------------------------------------------------------------------------
// Decision reasons (stored as JSON text in `decision_reason`)
// ---------------------------------------------------------------------------

export interface DecisionReason {
  codes: string[];
  note: string | null;
}

export function encodeDecisionReason(reason: DecisionReason): string {
  return JSON.stringify({ codes: reason.codes, note: reason.note });
}

export function parseDecisionReason(value: string | null): DecisionReason | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as DecisionReason).codes)) {
      const { codes, note } = parsed as DecisionReason;
      return { codes: codes.filter((code): code is string => typeof code === "string"), note: typeof note === "string" ? note : null };
    }
  } catch {
    // legacy free text
  }
  return { codes: [], note: value };
}

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

export function evidenceFileUrl(evidenceId: string, key: string): string {
  return `/api/v1/builder-evidence/${encodeURIComponent(evidenceId)}/files/${encodeURIComponent(evidenceFileName(key))}`;
}

export function toEvidenceDto(evidence: Evidence, role: EvidenceViewerRole, appeal?: EvidenceAppeal | null) {
  const decision = parseDecisionReason(evidence.decisionReason);
  return {
    id: evidence.id,
    userId: evidence.userId,
    projectId: evidence.projectId,
    eventType: evidence.eventType,
    stage: evidence.stage,
    title: evidence.title,
    summary: evidence.summary,
    occurredAt: evidence.occurredAt.toISOString(),
    links: evidence.links,
    files:
      role === "counterparty"
        ? []
        : evidence.privateObjectKeys.map((key) => ({ name: evidenceFileName(key), url: evidenceFileUrl(evidence.id, key) })),
    counterpartyUserId: evidence.counterpartyUserId,
    counterpartyConfirmedAt: evidence.counterpartyConfirmedAt?.toISOString() ?? null,
    status: evidence.status,
    source: evidence.source,
    visibility: evidence.visibility,
    clientKey: role === "counterparty" ? undefined : evidence.clientKey,
    decision: decision
      ? { reasonCodes: decision.codes, note: decision.note, decidedAt: evidence.decidedAt?.toISOString() ?? null }
      : null,
    eventId: evidence.eventId,
    appeal: appeal
      ? {
          id: appeal.id,
          status: appeal.status,
          resolution: appeal.resolution,
          createdAt: appeal.createdAt.toISOString(),
          resolvedAt: appeal.resolvedAt?.toISOString() ?? null,
        }
      : null,
    createdAt: evidence.createdAt.toISOString(),
    updatedAt: evidence.updatedAt.toISOString(),
  };
}
export type EvidenceDto = ReturnType<typeof toEvidenceDto>;

// ---------------------------------------------------------------------------
// Edit and withdraw
// ---------------------------------------------------------------------------

async function requireOwnOpenEvidence(db: AppDb, userId: string, evidenceId: string): Promise<Evidence> {
  const evidence = await getEvidence(db, evidenceId);
  if (!evidence || evidence.userId !== userId) throw new BuilderApiError(404, "not_found", "Evidence not found.");
  if (!(OPEN_EVIDENCE_STATUSES as readonly string[]).includes(evidence.status)) {
    throw new BuilderApiError(409, "evidence_locked", `Evidence that is ${evidence.status} can no longer be changed.`, { status: evidence.status });
  }
  return evidence;
}

/** Conditional update guarded by status and `updated_at`, so a decision or another edit in between wins. */
async function updateIfUnchanged(db: AppDb, current: Evidence, set: Partial<typeof activityEvidence.$inferInsert>): Promise<Evidence> {
  const [updated] = await db
    .update(activityEvidence)
    .set(set)
    .where(
      and(
        eq(activityEvidence.id, current.id),
        inArray(activityEvidence.status, [...OPEN_EVIDENCE_STATUSES]),
        eq(activityEvidence.updatedAt, current.updatedAt)
      )
    )
    .returning();
  if (!updated) throw new BuilderApiError(409, "evidence_changed", "The evidence changed in the meantime. Reload and try again.");
  return updated;
}

export async function editEvidence(
  db: AppDb,
  userId: string,
  evidenceId: string,
  input: unknown,
  options: { files?: File[]; bucket?: EvidenceBucket } = {}
): Promise<Evidence> {
  const patch = EditEvidenceSchema.parse(input);
  const current = await requireOwnOpenEvidence(db, userId, evidenceId);
  const files = options.files ?? [];

  const removeNames = new Set(patch.removeFiles ?? []);
  const keptKeys = current.privateObjectKeys.filter((key) => !removeNames.has(evidenceFileName(key)));
  const removedKeys = current.privateObjectKeys.filter((key) => removeNames.has(evidenceFileName(key)));
  const links = patch.links ?? current.links;
  const counterpartyUserId =
    patch.counterparty === undefined ? current.counterpartyUserId : await resolveCounterparty(db, userId, patch.counterparty);
  const occurredAt = patch.occurredAt ?? current.occurredAt;
  const summary = patch.summary ?? current.summary;
  const projectId = patch.projectId === undefined ? current.projectId : patch.projectId;

  await validateDraft(db, userId, {
    eventType: current.eventType,
    stage: current.stage,
    projectId,
    summary,
    occurredAt,
    linkCount: links.length,
    fileCount: keptKeys.length + files.length,
    counterpartyUserId,
  });
  const validatedFiles = await validateEvidenceFiles(files, keptKeys.length);
  const needsBucket = validatedFiles.length > 0 || removedKeys.length > 0;
  const bucket = needsBucket ? (options.bucket ?? getEvidenceBucket()) : null;
  const addedKeys = bucket && validatedFiles.length > 0 ? await putEvidenceFiles(bucket, userId, current.id, validatedFiles) : [];

  // What the counterparty confirmed must not change under them: a material edit asks them again.
  const material =
    counterpartyUserId !== current.counterpartyUserId ||
    occurredAt.getTime() !== current.occurredAt.getTime() ||
    summary !== current.summary ||
    (patch.title !== undefined && patch.title !== current.title);

  let updated: Evidence;
  try {
    updated = await updateIfUnchanged(db, current, {
      title: patch.title ?? current.title,
      summary,
      occurredAt,
      links,
      projectId,
      visibility: patch.visibility ?? current.visibility,
      counterpartyUserId,
      counterpartyConfirmedAt: material ? null : current.counterpartyConfirmedAt,
      privateObjectKeys: [...keptKeys, ...addedKeys],
      status: "submitted",
      updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
    });
  } catch (err) {
    if (bucket) await deleteEvidenceFiles(bucket, addedKeys);
    throw err;
  }
  if (bucket) await deleteEvidenceFiles(bucket, removedKeys);
  return updated;
}

export async function withdrawEvidence(db: AppDb, userId: string, evidenceId: string): Promise<Evidence> {
  const current = await getEvidence(db, evidenceId);
  if (current && current.userId === userId && current.status === "withdrawn") return current;
  const open = await requireOwnOpenEvidence(db, userId, evidenceId);
  return updateIfUnchanged(db, open, {
    status: "withdrawn",
    updatedAt: new Date(Math.max(Date.now(), open.updatedAt.getTime() + 1)),
  });
}

/** Status values accepted by list filters. */
export function parseEvidenceStatus(value: string | null): EvidenceStatus | undefined {
  if (!value) return undefined;
  if (!(EVIDENCE_STATUSES as readonly string[]).includes(value)) {
    throw new BuilderApiError(400, "invalid_status", `status must be one of ${EVIDENCE_STATUSES.join(", ")}.`);
  }
  return value as EvidenceStatus;
}

/**
 * Builds an `INSERT … SELECT … WHERE changes() = 1` audit statement. Placed right after a conditional
 * UPDATE in the same `db.batch`, it writes the audit row only when that update changed a row, so the
 * state change and its audit trail commit together and a losing concurrent request writes neither.
 */
export function auditIfChanged(
  db: AppDb,
  input: { targetType: string; targetId: string; action: string; actorId: string; actorRole: ActorRole; reasonCodes?: string[]; notes?: string | null }
) {
  // Column order must match the table definition: drizzle inserts into every column for `.select(sql)`.
  return db.insert(builderModerationActions).select(
    sql`select ${crypto.randomUUID()}, ${input.targetType}, ${input.targetId}, ${input.action}, ${input.actorId}, ${input.actorRole},
      ${JSON.stringify(input.reasonCodes ?? [])}, ${input.notes ?? null}, ${Date.now()}
    where changes() = 1`
  );
}
