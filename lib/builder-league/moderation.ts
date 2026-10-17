/**
 * Moderation of activity evidence and the admin tools around it (ledger reversal, pilot allowlist).
 *
 * Decisions are D1-safe and idempotent without transactions:
 * - A decision is a conditional UPDATE (`WHERE status IN (…)`) batched with an audit insert guarded by
 *   `changes() = 1`, so exactly one of several concurrent decisions wins and only the winner is audited.
 * - Approval then records the builder event (dedupe key on the evidence id) and awards it (ledger dedupe
 *   key). Both are replay-safe, so a double click, a concurrent approval or a retry after a crash between
 *   the steps completes the same single award instead of creating a second one.
 * - Only moderators and admins decide, never the evidence owner, and never API keys or agents (the
 *   admin routes require a signed-in admin session; these functions refuse other roles as well).
 */
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { activityEvidence, builderModerationActions, builderPilotMembers, builderProjects, scoreLedger, users } from "@/lib/db/schema";
import { BuilderApiError, encodeCursor, type Cursor } from "./http";
import { awardForEventDetailed, getBuilderEvent, recordBuilderEvent, reverseAward, type AwardResult, type BuilderEvent, type ScoreLedgerEntry } from "./ledger";
import { recordModerationAction } from "./audit";
import { refreshProgression } from "./progression-refresh";
import { getEffectiveRuleset } from "./ruleset";
import { STAGES, isEventTypeKey, type ActorRole, type EvidenceStatus, type Stage, type Verification } from "./types";
import {
  OPEN_EVIDENCE_STATUSES,
  auditIfChanged,
  encodeDecisionReason,
  getEvidence,
  type Evidence,
} from "./evidence";

/** `decided_by` of approvals made by the system (confirmed peer help that needs no moderator). */
export const SYSTEM_ACTOR_ID = "system";

const MODERATOR_ROLES: readonly ActorRole[] = ["moderator", "admin"];

export const DECISIONS = ["approve", "reject", "needs_info"] as const;
export type Decision = (typeof DECISIONS)[number];

/** Reason codes a moderator may attach, per decision. `other` needs a note. */
export const DECISION_REASON_CODES: Record<Decision, readonly string[]> = {
  approve: ["meets_requirements", "verified_link", "verified_file", "verified_counterparty"],
  reject: ["insufficient_evidence", "duplicate", "not_eligible", "wrong_event_type", "outside_window", "unverifiable", "spam", "other"],
  needs_info: ["missing_link", "summary_too_short", "unclear_outcome", "redact_private_data", "wrong_project", "other"],
};

const STATUS_FOR_DECISION: Record<Decision, EvidenceStatus> = { approve: "approved", reject: "rejected", needs_info: "needs_info" };

export interface ModeratorActor {
  actorId: string;
  actorRole: ActorRole;
}

function assertModerator(actor: ModeratorActor): void {
  if (!MODERATOR_ROLES.includes(actor.actorRole)) {
    throw new BuilderApiError(403, "moderation_not_allowed", "Only moderators and admins can decide on evidence.");
  }
}

export const DecisionInputSchema = z
  .object({
    decision: z.enum(DECISIONS),
    reasonCodes: z.array(z.string().max(40)).max(8).default([]),
    note: z
      .string()
      .trim()
      .max(2000)
      .nullish()
      .transform((value) => value || null),
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed = DECISION_REASON_CODES[value.decision];
    for (const code of value.reasonCodes) {
      if (!allowed.includes(code)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCodes"], message: `Unknown reason code ${code} for ${value.decision}.` });
    }
    if (value.decision !== "approve" && value.reasonCodes.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCodes"], message: "Rejections and information requests need at least one reason code." });
    }
    if (value.reasonCodes.includes("other") && !value.note) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "Explain the reason when choosing other." });
    }
  });
export type DecisionInput = z.input<typeof DecisionInputSchema>;

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface QueueFilters {
  status?: EvidenceStatus;
  stage?: Stage;
  eventType?: string;
  /** Only evidence submitted at least this many hours ago. */
  olderThanHours?: number;
  limit?: number;
  cursor?: Cursor | null;
}

export const QueueQuerySchema = z.object({
  status: z.enum(["submitted", "needs_info", "approved", "rejected", "withdrawn"]).default("submitted"),
  stage: z.enum(STAGES).optional(),
  eventType: z.string().max(64).optional(),
  olderThanHours: z.coerce.number().int().min(0).max(24 * 365).optional(),
});

/** Oldest first, so the queue is worked in arrival order; keyset-paginated on (`created_at`, `id`). */
export async function listModerationQueue(db: AppDb, filters: QueueFilters = {}) {
  const pageSize = Math.min(Math.max(filters.limit ?? 20, 1), 100);
  const conditions: SQL[] = [eq(activityEvidence.status, filters.status ?? "submitted")];
  if (filters.stage) conditions.push(eq(activityEvidence.stage, filters.stage));
  if (filters.eventType) conditions.push(eq(activityEvidence.eventType, filters.eventType));
  if (filters.olderThanHours !== undefined) {
    conditions.push(lte(activityEvidence.createdAt, new Date(Date.now() - filters.olderThanHours * 3_600_000)));
  }
  if (filters.cursor) {
    const at = new Date(filters.cursor.at);
    conditions.push(or(gt(activityEvidence.createdAt, at), and(eq(activityEvidence.createdAt, at), gt(activityEvidence.id, filters.cursor.id)))!);
  }
  const rows = await db
    .select({ evidence: activityEvidence, submitterName: users.name, projectName: builderProjects.name })
    .from(activityEvidence)
    .innerJoin(users, eq(users.id, activityEvidence.userId))
    .leftJoin(builderProjects, eq(builderProjects.id, activityEvidence.projectId))
    .where(and(...conditions))
    .orderBy(asc(activityEvidence.createdAt), asc(activityEvidence.id))
    .limit(pageSize + 1);
  const page = rows.slice(0, pageSize);
  const last = page[page.length - 1];
  const items = page.map(({ evidence, submitterName, projectName }) => {
    const definition = isEventTypeKey(evidence.eventType) ? getEffectiveRuleset(evidence.occurredAt).events[evidence.eventType] : undefined;
    return {
      evidence,
      submitterName,
      projectName,
      rulesetVersion: getEffectiveRuleset(evidence.occurredAt).version,
      rp: definition?.rp ?? null,
      requiredVerification: (definition?.requiredVerification ?? null) as Verification | null,
      awaitingCounterparty: Boolean(definition?.evidence.counterpartyConfirmation && !evidence.counterpartyConfirmedAt),
    };
  });
  return {
    items,
    nextCursor: rows.length > pageSize && last ? encodeCursor({ at: last.evidence.createdAt.getTime(), id: last.evidence.id }) : null,
    limit: pageSize,
  };
}
export type QueueItem = Awaited<ReturnType<typeof listModerationQueue>>["items"][number];

/** Counts for the admin hub. */
export async function getModerationSummary(db: AppDb) {
  const [statusRows, pilotRows, appealRows] = await Promise.all([
    db
      .select({ status: activityEvidence.status, count: sql<number>`count(*)` })
      .from(activityEvidence)
      .where(inArray(activityEvidence.status, [...OPEN_EVIDENCE_STATUSES]))
      .groupBy(activityEvidence.status),
    db.select({ count: sql<number>`count(*)` }).from(builderPilotMembers),
    db.all<{ count: number }>(sql`select count(*) as count from evidence_appeals where status = 'open'`),
  ]);
  const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count)]));
  return {
    submitted: byStatus.submitted ?? 0,
    needsInfo: byStatus.needs_info ?? 0,
    openAppeals: Number(appealRows[0]?.count ?? 0),
    pilotMembers: Number(pilotRows[0]?.count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export interface ApprovalOutcome {
  evidence: Evidence;
  event: BuilderEvent;
  award: { entry: ScoreLedgerEntry | null; created: boolean; reason: string | null };
  /** False when this call found the evidence already approved and only completed or replayed it. */
  decided: boolean;
}

/** Audit actions that record an approval of evidence (see `approveEvidence`). */
const APPROVAL_AUDIT_ACTIONS = ["approve", "approve_on_appeal"];

/**
 * Who approved the evidence, with the role they approved in. The role comes from the approval's audit
 * row, which is written in the same batch as the decision; `moderator` (the least privileged deciding
 * role) is the fallback when no such row is found.
 */
async function approverOf(db: AppDb, evidence: Evidence): Promise<{ actor: ModeratorActor; verification: Verification }> {
  if (evidence.decidedBy === SYSTEM_ACTOR_ID) return { actor: { actorId: SYSTEM_ACTOR_ID, actorRole: "system" }, verification: "peer_confirmed" };
  const actorId = evidence.decidedBy ?? "unknown";
  const [audit] = await db
    .select({ actorRole: builderModerationActions.actorRole })
    .from(builderModerationActions)
    .where(and(
      eq(builderModerationActions.targetType, "evidence"),
      eq(builderModerationActions.targetId, evidence.id),
      eq(builderModerationActions.actorId, actorId),
      inArray(builderModerationActions.action, APPROVAL_AUDIT_ACTIONS)
    ))
    .orderBy(desc(builderModerationActions.createdAt))
    .limit(1);
  const actorRole: ActorRole = audit && MODERATOR_ROLES.includes(audit.actorRole) ? audit.actorRole : "moderator";
  return { actor: { actorId, actorRole }, verification: "moderator_verified" };
}

/**
 * Records and awards the event of an approved evidence. The approver is read from the evidence row,
 * so every replay produces the same event dedupe key (`source|evidence:{id}|subject|type`).
 */
export async function completeApproval(db: AppDb, evidence: Evidence): Promise<Omit<ApprovalOutcome, "decided">> {
  if (evidence.status !== "approved") throw new BuilderApiError(409, "not_approved", "Evidence is not approved.");
  const { actor, verification } = await approverOf(db, evidence);
  const { event } = await recordBuilderEvent(db, {
    kind: "activity",
    subjectUserId: evidence.userId,
    actorUserId: actor.actorRole === "system" ? null : actor.actorId,
    actorRole: actor.actorRole,
    projectId: evidence.projectId,
    stage: evidence.stage,
    eventType: evidence.eventType,
    source: actor.actorRole === "system" ? "system" : "moderator",
    externalEventId: `evidence:${evidence.id}`,
    occurredAt: evidence.occurredAt,
    verification,
    visibility: evidence.visibility,
    evidenceId: evidence.id,
    payload: { counterpartyUserId: evidence.counterpartyUserId, title: evidence.title },
    provenance: { evidenceSource: evidence.source },
  });
  const award: AwardResult = await awardForEventDetailed(db, event.id, actor);
  let current = evidence;
  if (!evidence.eventId) {
    const [linked] = await db
      .update(activityEvidence)
      .set({ eventId: event.id })
      .where(and(eq(activityEvidence.id, evidence.id), isNull(activityEvidence.eventId)))
      .returning();
    current = linked ?? (await getEvidence(db, evidence.id)) ?? evidence;
  }
  // New RP may open a rank or badge. Replays skip it; the weekly finalization and badge reads catch up.
  if (award.created) await refreshProgression(db, evidence.userId, { actorId: actor.actorRole === "system" ? null : actor.actorId, trigger: "approval" });
  return { evidence: current, event, award: { entry: award.entry, created: award.created, reason: award.reason } };
}

interface ApproveOptions {
  fromStatuses: readonly EvidenceStatus[];
  reasonCodes: string[];
  note: string | null;
  auditAction?: string;
}

/**
 * The approval preconditions, without writing anything: the evidence exists, is not the actor's own, and
 * is either already approved (a replay) or in one of `fromStatuses` with any required counterparty
 * confirmation in place. Callers that must not commit a related change unless the approval can go
 * through (an appeal overturn) check this first.
 */
export function assertApprovable(evidence: Evidence | null, actor: ModeratorActor, fromStatuses: readonly EvidenceStatus[]): Evidence {
  if (!evidence) throw new BuilderApiError(404, "not_found", "Evidence not found.");
  if (evidence.userId === actor.actorId) throw new BuilderApiError(403, "self_moderation", "You cannot decide on your own evidence.");
  if (evidence.status === "approved") return evidence;
  if (!fromStatuses.includes(evidence.status)) {
    throw new BuilderApiError(409, "already_decided", `Evidence is ${evidence.status}.`, { status: evidence.status });
  }
  const definition = isEventTypeKey(evidence.eventType) ? getEffectiveRuleset(evidence.occurredAt).events[evidence.eventType] : undefined;
  if (definition?.evidence.counterpartyConfirmation && !evidence.counterpartyConfirmedAt) {
    throw new BuilderApiError(409, "counterparty_unconfirmed", "The counterparty has not confirmed this evidence yet.");
  }
  return evidence;
}

/**
 * Claims the evidence as approved (one winner among concurrent callers), then completes the award.
 * Callers that find it already approved complete or replay the same award.
 */
export async function approveEvidence(db: AppDb, evidenceId: string, actor: ModeratorActor, options: ApproveOptions): Promise<ApprovalOutcome> {
  if (!MODERATOR_ROLES.includes(actor.actorRole) && !(actor.actorRole === "system" && actor.actorId === SYSTEM_ACTOR_ID)) {
    throw new BuilderApiError(403, "moderation_not_allowed", "Only moderators, admins and the system can approve evidence.");
  }
  const evidence = assertApprovable(await getEvidence(db, evidenceId), actor, options.fromStatuses);
  if (evidence.status === "approved") return { ...(await completeApproval(db, evidence)), decided: false };

  const now = new Date();
  const [claimed] = await db.batch([
    db
      .update(activityEvidence)
      .set({
        status: "approved",
        decidedBy: actor.actorId,
        decidedAt: now,
        decisionReason: encodeDecisionReason({ codes: options.reasonCodes, note: options.note }),
        updatedAt: now,
      })
      .where(and(eq(activityEvidence.id, evidenceId), inArray(activityEvidence.status, [...options.fromStatuses])))
      .returning(),
    auditIfChanged(db, {
      targetType: "evidence",
      targetId: evidenceId,
      action: options.auditAction ?? "approve",
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      reasonCodes: options.reasonCodes,
      notes: options.note,
    }),
  ]);
  if (claimed[0]) return { ...(await completeApproval(db, claimed[0])), decided: true };

  // Lost the race: replay when the winner approved, otherwise report the competing decision.
  const latest = await getEvidence(db, evidenceId);
  if (latest?.status === "approved") return { ...(await completeApproval(db, latest)), decided: false };
  throw new BuilderApiError(409, "already_decided", `Evidence is ${latest?.status ?? "missing"}.`, { status: latest?.status });
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export type DecisionOutcome =
  | ({ decision: "approve" } & ApprovalOutcome)
  | { decision: "reject" | "needs_info"; evidence: Evidence; decided: boolean };

export async function decideEvidence(db: AppDb, evidenceId: string, input: unknown, actor: ModeratorActor): Promise<DecisionOutcome> {
  assertModerator(actor);
  const parsed = DecisionInputSchema.parse(input);
  if (parsed.decision === "approve") {
    const outcome = await approveEvidence(db, evidenceId, actor, {
      fromStatuses: OPEN_EVIDENCE_STATUSES,
      reasonCodes: parsed.reasonCodes.length > 0 ? parsed.reasonCodes : ["meets_requirements"],
      note: parsed.note,
    });
    return { decision: "approve", ...outcome };
  }

  const evidence = await getEvidence(db, evidenceId);
  if (!evidence) throw new BuilderApiError(404, "not_found", "Evidence not found.");
  if (evidence.userId === actor.actorId) throw new BuilderApiError(403, "self_moderation", "You cannot decide on your own evidence.");
  const target = STATUS_FOR_DECISION[parsed.decision];
  const reason = encodeDecisionReason({ codes: parsed.reasonCodes, note: parsed.note });
  if (evidence.status === target && evidence.decisionReason === reason) return { decision: parsed.decision, evidence, decided: false };

  const now = new Date();
  const [updated] = await db.batch([
    db
      .update(activityEvidence)
      .set({ status: target, decidedBy: actor.actorId, decidedAt: now, decisionReason: reason, updatedAt: now })
      .where(and(eq(activityEvidence.id, evidenceId), inArray(activityEvidence.status, [...OPEN_EVIDENCE_STATUSES])))
      .returning(),
    auditIfChanged(db, {
      targetType: "evidence",
      targetId: evidenceId,
      action: parsed.decision === "reject" ? "reject" : "request_info",
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      reasonCodes: parsed.reasonCodes,
      notes: parsed.note,
    }),
  ]);
  if (updated[0]) return { decision: parsed.decision, evidence: updated[0], decided: true };
  const latest = await getEvidence(db, evidenceId);
  if (latest && latest.status === target && latest.decisionReason === reason) return { decision: parsed.decision, evidence: latest, decided: false };
  throw new BuilderApiError(409, "already_decided", `Evidence is ${latest?.status ?? "missing"}.`, { status: latest?.status });
}

// ---------------------------------------------------------------------------
// Ledger reversal
// ---------------------------------------------------------------------------

export const ReverseInputSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();

/** Admin reversal of a ledger entry: a negative entry plus an audit row (see `reverseAward`). */
export async function reverseLedgerEntry(db: AppDb, entryId: string, input: unknown, actor: ModeratorActor): Promise<ScoreLedgerEntry> {
  assertModerator(actor);
  const { reason } = ReverseInputSchema.parse(input);
  return reverseAward(db, entryId, { actorId: actor.actorId, actorRole: actor.actorRole, reason });
}

/** Ledger entries created for an evidence (award and any reversal), newest first. */
export async function ledgerEntriesForEvidence(db: AppDb, evidence: Evidence): Promise<ScoreLedgerEntry[]> {
  if (!evidence.eventId) return [];
  const event = await getBuilderEvent(db, evidence.eventId);
  if (!event) return [];
  const awards = await db.select().from(scoreLedger).where(eq(scoreLedger.eventId, event.id));
  const ids = awards.map((entry) => entry.id);
  const reversals = ids.length
    ? await db.select().from(scoreLedger).where(and(inArray(scoreLedger.reversesEntryId, ids), isNotNull(scoreLedger.reversesEntryId)))
    : [];
  return [...awards, ...reversals].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ---------------------------------------------------------------------------
// Pilot allowlist
// ---------------------------------------------------------------------------

export const PilotInputSchema = z
  .object({
    action: z.enum(["add", "remove"]),
    userId: z.string().trim().min(1).max(128).optional(),
    email: z.string().trim().email().max(320).optional(),
    note: z
      .string()
      .trim()
      .max(300)
      .nullish()
      .transform((value) => value || null),
  })
  .strict()
  .refine((value) => Boolean(value.userId) !== Boolean(value.email), { message: "Give either userId or email." });

export async function listPilotMembers(db: AppDb) {
  return db
    .select({
      userId: builderPilotMembers.userId,
      name: users.name,
      email: users.email,
      note: builderPilotMembers.note,
      addedBy: builderPilotMembers.addedBy,
      addedAt: builderPilotMembers.addedAt,
    })
    .from(builderPilotMembers)
    .innerJoin(users, eq(users.id, builderPilotMembers.userId))
    .orderBy(desc(builderPilotMembers.addedAt));
}

export async function updatePilotMembers(db: AppDb, input: unknown, actor: ModeratorActor): Promise<{ userId: string; action: "add" | "remove"; changed: boolean }> {
  assertModerator(actor);
  const parsed = PilotInputSchema.parse(input);
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(parsed.userId ? eq(users.id, parsed.userId) : sql`lower(${users.email}) = ${parsed.email!.toLowerCase()}`)
    .limit(1);
  if (!user) throw new BuilderApiError(404, "user_not_found", "No user with that id or email.");

  if (parsed.action === "add") {
    const inserted = await db
      .insert(builderPilotMembers)
      .values({ userId: user.id, addedBy: actor.actorId, note: parsed.note, addedAt: new Date() })
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) {
      await recordModerationAction(db, { targetType: "pilot_member", targetId: user.id, action: "add", actorId: actor.actorId, actorRole: actor.actorRole, notes: parsed.note });
    }
    return { userId: user.id, action: "add", changed: inserted.length > 0 };
  }
  const removed = await db.delete(builderPilotMembers).where(eq(builderPilotMembers.userId, user.id)).returning();
  if (removed.length > 0) {
    await recordModerationAction(db, { targetType: "pilot_member", targetId: user.id, action: "remove", actorId: actor.actorId, actorRole: actor.actorRole, notes: parsed.note });
  }
  return { userId: user.id, action: "remove", changed: removed.length > 0 };
}

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

export function toAwardDto(award: ApprovalOutcome["award"]) {
  return {
    entryId: award.entry?.id ?? null,
    rp: award.entry?.rp ?? 0,
    rulesetVersion: award.entry?.rulesetVersion ?? null,
    created: award.created,
    skippedReason: award.reason,
  };
}
