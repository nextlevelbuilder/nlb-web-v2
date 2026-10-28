/**
 * Member privacy requests for the Builder League: export everything the league holds about one member,
 * or delete it. Admins run both for any member (`/api/v1/builder-admin/privacy/{userId}/…`); members run
 * them for themselves (`/api/v1/builder-me/export`, `/api/v1/builder-me/delete` and the settings page).
 * The account row in `users` is left alone, as account deletion is a separate process.
 *
 * Delete removes the member's personal league data: private evidence files in R2 (`evidence/{userId}/`
 * and rendered videos under `renders/{userId}/`), evidence and appeals, privacy switches, the pilot
 * entry, projects, badges, ranks, nominations, season entries, reward claims (open claims give their
 * unit back), Time Capsule notes, yearly snapshots, render jobs, share links and their attribution rows.
 *
 * History is pseudonymised rather than deleted: in `builder_events`, `score_ledger`, `score_cap_slots`,
 * `builder_moderation_actions`, the stored entries of `league_snapshots` and the decision/actor columns
 * of other members' rows, the member's id is replaced by a fresh tombstone id (`deleted-<uuid>`). Entry
 * ids, RP, dates and snapshot hashes do not change, so finalized boards and their revisions still
 * reproduce exactly, while nothing links them back to the person. This is the one sanctioned exception
 * to "no UPDATE on builder_events / score_ledger": it rewrites identity columns only, never amounts.
 * No mapping from the old id to the tombstone is stored anywhere, including the audit row. Cap slot keys
 * (which embed user ids) are rewritten the same way, and the member is removed from the peer mentions of
 * other members' Year in Review snapshots. The sha256 dedupe keys of events and ledger entries are kept,
 * because they guard against double imports; they can only be matched by someone who already knows the
 * old id and the source record.
 *
 * Order: R2 objects are deleted first (and the call fails if any delete fails), then every D1 change
 * runs in one `db.batch`, which D1 applies atomically. A failed request can simply be retried; once it
 * succeeded, a repeat finds nothing to change.
 */
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { AppDb } from "@/lib/db";
import {
  activityEvidence,
  badgeAwards,
  builderEvents,
  builderModerationActions,
  builderPilotMembers,
  builderPrivacy,
  builderProjects,
  builderShareLinks,
  evidenceAppeals,
  leagueSnapshots,
  mentorNominations,
  rankAwards,
  renderJobs,
  rewardClaims,
  rewardItems,
  scoreCapSlots,
  scoreLedger,
  seasonEnrollments,
  shareAttributions,
  timeCapsuleEntries,
  users,
  yearlySnapshots,
} from "@/lib/db/schema";
import { recordModerationAction } from "./audit";
import { getEvidenceBucket } from "./evidence-storage";
import { BuilderApiError } from "./http";
import { renderOutputKey } from "./render-jobs";
import { serializeShareLink } from "./share-links";
import { TOMBSTONE_USER_PREFIX, type ActorRole } from "./types";

export const PRIVACY_EXPORT_SCHEMA = 1;
export const TOMBSTONE_PREFIX = TOMBSTONE_USER_PREFIX;

/** Ids the routes accept: better-auth ids and test ids, never a tombstone. */
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function assertPrivacyUserId(userId: string): void {
  if (!USER_ID.test(userId) || userId.startsWith(TOMBSTONE_PREFIX)) {
    throw new BuilderApiError(400, "invalid_user_id", "Not a valid member id.");
  }
}

/** The R2 calls the privacy routine needs; `list` is optional so orphan sweeps degrade gracefully. */
export interface PrivacyBucket {
  delete(keys: string | string[]): Promise<void>;
  list?(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

export interface PrivacyActor {
  actorId: string;
  actorRole?: ActorRole;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface BuilderDataExport {
  schema: number;
  userId: string;
  exportedAt: string;
  notes: string[];
  privacy: unknown;
  pilot: unknown;
  projects: unknown[];
  evidence: unknown[];
  appeals: unknown[];
  confirmationsGiven: unknown[];
  events: unknown[];
  ledger: unknown[];
  badges: unknown[];
  ranks: unknown[];
  nominations: unknown[];
  seasons: unknown[];
  rewardClaims: unknown[];
  timeCapsule: unknown[];
  yearlySnapshots: unknown[];
  shareLinks: unknown[];
  shareFunnel: { visits: number; signups: number; paid: number };
  renderJobs: unknown[];
  moderationHistory: unknown[];
}

/** Drops one column from every row: moderator and admin ids are other people's data. */
function omitColumn<T extends object, K extends keyof T>(rows: T[], column: K): Omit<T, K>[] {
  return rows.map((row) => {
    const { [column]: _omitted, ...rest } = row;
    return rest;
  });
}

/** Ledger reasons read `awarded_by:{role}:{actorId}`; the export keeps the role and drops the id. */
function withoutLedgerActor<T extends { reason: string | null }>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row, reason: row.reason?.replace(/^(awarded_by:[^:]+):.*$/, "$1") ?? null }));
}

/**
 * Everything the league stores about the member, as JSON. Moderators' ids are left out of the
 * decision history (they are other people's data); evidence files are listed by name and can be
 * downloaded through `GET /api/v1/builder-evidence/{id}/files/{name}`. Throws 404 when the member has
 * neither an account nor any league data.
 */
export async function exportBuilderData(db: AppDb, userId: string, now = new Date()): Promise<BuilderDataExport> {
  assertPrivacyUserId(userId);
  const [
    [account],
    privacy,
    pilot,
    projects,
    evidence,
    appeals,
    confirmationsGiven,
    events,
    ledger,
    badges,
    ranks,
    nominations,
    seasons,
    claims,
    capsule,
    snapshots,
    links,
    renders,
  ] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(builderPrivacy).where(eq(builderPrivacy.userId, userId)),
    db.select({ addedAt: builderPilotMembers.addedAt, note: builderPilotMembers.note }).from(builderPilotMembers).where(eq(builderPilotMembers.userId, userId)),
    db.select().from(builderProjects).where(eq(builderProjects.ownerUserId, userId)),
    db.select().from(activityEvidence).where(eq(activityEvidence.userId, userId)),
    db.select().from(evidenceAppeals).where(eq(evidenceAppeals.userId, userId)),
    db
      .select({ evidenceId: activityEvidence.id, eventType: activityEvidence.eventType, confirmedAt: activityEvidence.counterpartyConfirmedAt })
      .from(activityEvidence)
      .where(and(eq(activityEvidence.counterpartyUserId, userId), isNotNull(activityEvidence.counterpartyConfirmedAt))),
    db.select().from(builderEvents).where(eq(builderEvents.subjectUserId, userId)),
    db.select().from(scoreLedger).where(eq(scoreLedger.userId, userId)),
    db.select().from(badgeAwards).where(eq(badgeAwards.userId, userId)),
    db.select().from(rankAwards).where(eq(rankAwards.userId, userId)),
    db
      .select({ rank: mentorNominations.rank, year: mentorNominations.year, note: mentorNominations.note, createdAt: mentorNominations.createdAt })
      .from(mentorNominations)
      .where(eq(mentorNominations.nomineeUserId, userId)),
    db.select().from(seasonEnrollments).where(eq(seasonEnrollments.userId, userId)),
    db.select().from(rewardClaims).where(eq(rewardClaims.userId, userId)),
    db.select().from(timeCapsuleEntries).where(eq(timeCapsuleEntries.userId, userId)),
    db.select().from(yearlySnapshots).where(eq(yearlySnapshots.userId, userId)),
    db.select().from(builderShareLinks).where(eq(builderShareLinks.userId, userId)),
    db.select().from(renderJobs).where(eq(renderJobs.userId, userId)),
  ]);

  const linkIds = links.map((link) => link.id);
  const evidenceIds = evidence.map((row) => row.id);
  const [funnelRows, moderation] = await Promise.all([
    linkIds.length === 0
      ? Promise.resolve([] as { kind: string; count: number }[])
      : db
          .select({ kind: shareAttributions.kind, count: sql<number>`count(*)` })
          .from(shareAttributions)
          .where(inArray(shareAttributions.shareLinkId, linkIds))
          .groupBy(shareAttributions.kind),
    db
      .select({
        targetType: builderModerationActions.targetType,
        targetId: builderModerationActions.targetId,
        action: builderModerationActions.action,
        actorRole: builderModerationActions.actorRole,
        reasonCodes: builderModerationActions.reasonCodes,
        notes: builderModerationActions.notes,
        createdAt: builderModerationActions.createdAt,
      })
      .from(builderModerationActions)
      .where(
        evidenceIds.length === 0
          ? eq(builderModerationActions.targetId, userId)
          : or(eq(builderModerationActions.targetId, userId), and(eq(builderModerationActions.targetType, "evidence"), inArray(builderModerationActions.targetId, evidenceIds)))
      ),
  ]);

  const hasData = [privacy, pilot, projects, evidence, events, ledger, badges, ranks, seasons, claims, capsule, snapshots, links, renders].some((rows) => rows.length > 0);
  if (!account && !hasData) throw new BuilderApiError(404, "not_found", "No member or league data with that id.");

  const funnel = Object.fromEntries(funnelRows.map((row) => [row.kind, Number(row.count)]));
  return {
    schema: PRIVACY_EXPORT_SCHEMA,
    userId,
    exportedAt: now.toISOString(),
    notes: [
      "Times are ISO 8601 (UTC). League periods use Asia/Ho_Chi_Minh.",
      "Evidence files are listed by key; download them through GET /api/v1/builder-evidence/{id}/files/{name}.",
      "Moderator identities are omitted from the decision history.",
    ],
    privacy: privacy[0] ?? null,
    pilot: pilot[0] ?? null,
    projects,
    evidence: omitColumn(evidence, "decidedBy"),
    appeals: omitColumn(appeals, "resolvedBy"),
    confirmationsGiven,
    // The member's own actions keep their id; anyone else acting on them (moderators, the system) is dropped.
    events: events.map((event) => ({ ...event, actorUserId: event.actorUserId === userId ? userId : null })),
    ledger: withoutLedgerActor(ledger),
    badges,
    ranks: omitColumn(ranks, "awardedBy"),
    nominations,
    seasons,
    rewardClaims: omitColumn(claims, "decidedBy"),
    timeCapsule: capsule,
    yearlySnapshots: snapshots,
    shareLinks: links.map(serializeShareLink),
    shareFunnel: { visits: funnel.visit ?? 0, signups: funnel.signup ?? 0, paid: funnel.paid ?? 0 },
    renderJobs: renders.map(({ id, year, format, status, createdAt, expiresAt }) => ({ id, year, format, status, createdAt, expiresAt })),
    moderationHistory: moderation,
  };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export interface BuilderDataDeletion {
  /** Fresh id that replaced the member's id in retained history. Not stored next to the old id. */
  tombstoneId: string;
  objectsDeleted: number;
  deleted: Record<string, number>;
  pseudonymised: Record<string, number>;
  /** True when nothing was left to delete or pseudonymise (an earlier request already completed). */
  nothingToDo: boolean;
}

async function listKeys(bucket: PrivacyBucket, prefix: string): Promise<string[]> {
  if (!bucket.list) return [];
  const keys: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const result = await bucket.list({ prefix, cursor, limit: 1000 });
    keys.push(...result.objects.map((object) => object.key));
    if (!result.truncated || !result.cursor) break;
    cursor = result.cursor;
  }
  return keys;
}

/** Deletes keys in chunks of 1000 (the R2 limit); any failure aborts the request. */
async function deleteObjects(bucket: PrivacyBucket, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    try {
      await bucket.delete(keys.slice(i, i + 1000));
    } catch (err) {
      console.error("builder privacy: R2 delete failed", err instanceof Error ? err.message : err);
      throw new BuilderApiError(502, "storage_delete_failed", "Private files could not be deleted. Nothing else was changed; retry the request.");
    }
  }
}

export interface DeleteOptions extends PrivacyActor {
  /** Defaults to the `BUILDER_EVIDENCE` binding. */
  bucket?: PrivacyBucket;
  now?: Date;
}

/**
 * Deletes the member's league data and pseudonymises their history (see the module comment).
 * Idempotent: a repeat after success changes nothing and reports `nothingToDo`.
 */
export async function deleteBuilderData(db: AppDb, userId: string, options: DeleteOptions): Promise<BuilderDataDeletion> {
  assertPrivacyUserId(userId);
  if (!options.actorId) throw new BuilderApiError(400, "actor_required", "An acting admin is required.");
  const bucket = options.bucket ?? getEvidenceBucket();
  const now = options.now ?? new Date();

  // 1. Private objects: keys referenced by evidence and render jobs, plus anything left under the
  //    member's prefixes (orphans from interrupted uploads).
  const [evidenceRows, renderRows] = await Promise.all([
    db.select({ keys: activityEvidence.privateObjectKeys }).from(activityEvidence).where(eq(activityEvidence.userId, userId)),
    db
      .select({ id: renderJobs.id, userId: renderJobs.userId, year: renderJobs.year, outputKey: renderJobs.outputKey })
      .from(renderJobs)
      .where(eq(renderJobs.userId, userId)),
  ]);
  const keys = new Set<string>([
    ...evidenceRows.flatMap((row) => row.keys ?? []),
    ...renderRows.flatMap((job) => [renderOutputKey(job, "video"), renderOutputKey(job, "poster"), ...(job.outputKey ? [job.outputKey] : [])]),
    ...(await listKeys(bucket, `evidence/${userId}/`)),
    ...(await listKeys(bucket, `renders/${userId}/`)),
  ]);
  await deleteObjects(bucket, [...keys]);

  // 2. One atomic D1 batch.
  const tombstoneId = `${TOMBSTONE_PREFIX}${crypto.randomUUID()}`;
  const ownEvidence = db.select({ id: activityEvidence.id }).from(activityEvidence).where(eq(activityEvidence.userId, userId));
  const ownLinks = db.select({ id: builderShareLinks.id }).from(builderShareLinks).where(eq(builderShareLinks.userId, userId));
  const needle = `"userId":"${userId}"`;
  const replacement = `"userId":"${tombstoneId}"`;
  const actorReason = `:${userId}`;

  const deletes = {
    evidenceAppeals: db
      .delete(evidenceAppeals)
      .where(or(eq(evidenceAppeals.userId, userId), inArray(evidenceAppeals.evidenceId, ownEvidence)))
      .returning({ id: evidenceAppeals.id }),
    activityEvidence: db.delete(activityEvidence).where(eq(activityEvidence.userId, userId)).returning({ id: activityEvidence.id }),
    builderPrivacy: db.delete(builderPrivacy).where(eq(builderPrivacy.userId, userId)).returning({ id: builderPrivacy.userId }),
    builderPilotMembers: db.delete(builderPilotMembers).where(eq(builderPilotMembers.userId, userId)).returning({ id: builderPilotMembers.userId }),
    builderProjects: db.delete(builderProjects).where(eq(builderProjects.ownerUserId, userId)).returning({ id: builderProjects.id }),
    badgeAwards: db.delete(badgeAwards).where(eq(badgeAwards.userId, userId)).returning({ id: badgeAwards.id }),
    rankAwards: db.delete(rankAwards).where(eq(rankAwards.userId, userId)).returning({ id: rankAwards.id }),
    mentorNominations: db
      .delete(mentorNominations)
      .where(or(eq(mentorNominations.nomineeUserId, userId), eq(mentorNominations.mentorUserId, userId)))
      .returning({ id: mentorNominations.id }),
    seasonEnrollments: db.delete(seasonEnrollments).where(eq(seasonEnrollments.userId, userId)).returning({ id: seasonEnrollments.seasonKey }),
    rewardClaims: db.delete(rewardClaims).where(eq(rewardClaims.userId, userId)).returning({ id: rewardClaims.id }),
    timeCapsuleEntries: db.delete(timeCapsuleEntries).where(eq(timeCapsuleEntries.userId, userId)).returning({ id: timeCapsuleEntries.id }),
    yearlySnapshots: db.delete(yearlySnapshots).where(eq(yearlySnapshots.userId, userId)).returning({ id: yearlySnapshots.id }),
    renderJobs: db.delete(renderJobs).where(eq(renderJobs.userId, userId)).returning({ id: renderJobs.id }),
    shareAttributions: db.delete(shareAttributions).where(inArray(shareAttributions.shareLinkId, ownLinks)).returning({ id: shareAttributions.id }),
    builderShareLinks: db.delete(builderShareLinks).where(eq(builderShareLinks.userId, userId)).returning({ id: builderShareLinks.id }),
  };
  const pseudonymise = {
    builderEvents: db.update(builderEvents).set({ subjectUserId: tombstoneId }).where(eq(builderEvents.subjectUserId, userId)).returning({ id: builderEvents.id }),
    builderEventActors: db.update(builderEvents).set({ actorUserId: tombstoneId }).where(eq(builderEvents.actorUserId, userId)).returning({ id: builderEvents.id }),
    builderEventCounterparties: db
      .update(builderEvents)
      .set({ payload: sql`json_set(${builderEvents.payload}, '$.counterpartyUserId', ${tombstoneId})` })
      .where(sql`json_extract(${builderEvents.payload}, '$.counterpartyUserId') = ${userId}`)
      .returning({ id: builderEvents.id }),
    scoreLedger: db.update(scoreLedger).set({ userId: tombstoneId }).where(eq(scoreLedger.userId, userId)).returning({ id: scoreLedger.id }),
    scoreLedgerAwarders: db
      .update(scoreLedger)
      .set({ reason: sql`substr(${scoreLedger.reason}, 1, length(${scoreLedger.reason}) - ${actorReason.length}) || ${`:${tombstoneId}`}` })
      .where(and(sql`${scoreLedger.reason} like 'awarded_by:%'`, sql`substr(${scoreLedger.reason}, -${actorReason.length}) = ${actorReason}`))
      .returning({ id: scoreLedger.id }),
    scoreCapSlots: db.update(scoreCapSlots).set({ userId: tombstoneId }).where(eq(scoreCapSlots.userId, userId)).returning({ id: scoreCapSlots.slotKey }),
    // Slot keys are `user|eventType|scope|window|index`; the scope can be another member's counterparty id.
    capSlotKeys: db
      .update(scoreCapSlots)
      .set({ slotKey: sql`substr(replace('|' || ${scoreCapSlots.slotKey}, ${`|${userId}|`}, ${`|${tombstoneId}|`}), 2)` })
      .where(sql`instr('|' || ${scoreCapSlots.slotKey}, ${`|${userId}|`}) > 0`)
      .returning({ id: scoreCapSlots.slotKey }),
    moderationActors: db
      .update(builderModerationActions)
      .set({ actorId: tombstoneId })
      .where(eq(builderModerationActions.actorId, userId))
      .returning({ id: builderModerationActions.id }),
    moderationTargets: db
      .update(builderModerationActions)
      .set({ targetId: tombstoneId })
      .where(eq(builderModerationActions.targetId, userId))
      .returning({ id: builderModerationActions.id }),
    leagueSnapshots: db
      .update(leagueSnapshots)
      .set({ entries: sql`replace(${leagueSnapshots.entries}, ${needle}, ${replacement})` })
      .where(sql`instr(${leagueSnapshots.entries}, ${needle}) > 0`)
      .returning({ id: leagueSnapshots.id }),
    // Other members' Year in Review may name the member as someone they helped (with consent at the
    // time); deletion withdraws that consent, so the mention is removed rather than pseudonymised.
    yearReviewMentions: db
      .update(yearlySnapshots)
      .set({
        data: sql`json_set(${yearlySnapshots.data}, '$.peerMentions', json((
          select json_group_array(json(m.value)) from json_each(${yearlySnapshots.data}, '$.peerMentions') m
          where json_extract(m.value, '$.userId') <> ${userId}
        )))`,
      })
      .where(
        and(
          sql`${yearlySnapshots.userId} <> ${userId}`,
          sql`exists (select 1 from json_each(${yearlySnapshots.data}, '$.peerMentions') m where json_extract(m.value, '$.userId') = ${userId})`
        )
      )
      .returning({ id: yearlySnapshots.id }),
    counterpartyMentions: db
      .update(activityEvidence)
      .set({ counterpartyUserId: tombstoneId })
      .where(eq(activityEvidence.counterpartyUserId, userId))
      .returning({ id: activityEvidence.id }),
    evidenceDecisions: db.update(activityEvidence).set({ decidedBy: tombstoneId }).where(eq(activityEvidence.decidedBy, userId)).returning({ id: activityEvidence.id }),
    appealResolutions: db.update(evidenceAppeals).set({ resolvedBy: tombstoneId }).where(eq(evidenceAppeals.resolvedBy, userId)).returning({ id: evidenceAppeals.id }),
    claimDecisions: db.update(rewardClaims).set({ decidedBy: tombstoneId }).where(eq(rewardClaims.decidedBy, userId)).returning({ id: rewardClaims.id }),
    rankAwarders: db.update(rankAwards).set({ awardedBy: tombstoneId }).where(eq(rankAwards.awardedBy, userId)).returning({ id: rankAwards.id }),
    pilotAdders: db.update(builderPilotMembers).set({ addedBy: tombstoneId }).where(eq(builderPilotMembers.addedBy, userId)).returning({ id: builderPilotMembers.userId }),
    attributionVisitors: db.update(shareAttributions).set({ userId: null }).where(eq(shareAttributions.userId, userId)).returning({ id: shareAttributions.id }),
  };

  // Open claims hold a unit of a limited reward: give it back before the claims disappear.
  const releaseUnits = db
    .update(rewardItems)
    .set({
      inventory: sql`${rewardItems.inventory} + (select count(*) from reward_claims c where c.reward_id = ${rewardItems.id} and c.user_id = ${userId} and c.status in ('requested', 'approved'))`,
      updatedAt: now,
    })
    .where(
      and(
        isNotNull(rewardItems.inventory),
        sql`exists (select 1 from reward_claims c where c.reward_id = ${rewardItems.id} and c.user_id = ${userId} and c.status in ('requested', 'approved'))`
      )
    );

  // Pseudonymise before deleting, so the evidence-decision and appeal updates see their rows; the
  // member's own evidence rows are deleted afterwards either way.
  const pseudonymiseEntries = Object.entries(pseudonymise);
  const deleteEntries = Object.entries(deletes);
  const statements: BatchItem<"sqlite">[] = [releaseUnits, ...pseudonymiseEntries.map(([, q]) => q), ...deleteEntries.map(([, q]) => q)];
  const results = (await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]])) as unknown[];

  const counts = (entries: [string, unknown][], offset: number) =>
    Object.fromEntries(entries.map(([name], index) => [name, Array.isArray(results[offset + index]) ? (results[offset + index] as unknown[]).length : 0]));
  const pseudonymised = counts(pseudonymiseEntries, 1);
  const deleted = counts(deleteEntries, 1 + pseudonymiseEntries.length);
  const nothingToDo = keys.size === 0 && [...Object.values(deleted), ...Object.values(pseudonymised)].every((count) => count === 0);

  if (!nothingToDo) {
    // The audit row names the tombstone only, so it cannot be used to re-identify the history. When the
    // member deletes their own data the actor is the member too, so the tombstone stands in for both.
    const selfService = options.actorId === userId;
    await recordModerationAction(db, {
      targetType: "privacy_request",
      targetId: tombstoneId,
      action: "delete",
      actorId: selfService ? tombstoneId : options.actorId,
      actorRole: options.actorRole ?? "admin",
      reasonCodes: selfService ? ["privacy_delete", "self_service"] : ["privacy_delete"],
      notes: JSON.stringify({ objectsDeleted: keys.size, deleted, pseudonymised }),
    });
  }

  return { tombstoneId, objectsDeleted: keys.size, deleted, pseudonymised, nothingToDo };
}

// ---------------------------------------------------------------------------
// Member self-service
// ---------------------------------------------------------------------------

/** The word a member types (or sends as `confirm`) to delete their own league data. */
export const SELF_DELETE_CONFIRMATION = "DELETE";

export interface SelfDeleteRequest {
  userId: string;
  /** Admins are refused, as on the admin route, so their moderation decisions keep a known actor. */
  isAdmin: boolean;
  confirm: unknown;
  bucket?: PrivacyBucket;
  now?: Date;
}

/**
 * A member deletes their own league data. The caller must already have checked that the request comes
 * from the member's signed-in session (API keys and agents must never erase a member's history). This
 * checks the typed confirmation and the admin rule, then runs the admin routine with the member as actor.
 */
export async function deleteOwnBuilderData(db: AppDb, request: SelfDeleteRequest): Promise<BuilderDataDeletion> {
  if (request.confirm !== SELF_DELETE_CONFIRMATION) {
    throw new BuilderApiError(400, "confirmation_mismatch", `Type ${SELF_DELETE_CONFIRMATION} to confirm the deletion.`);
  }
  if (request.isAdmin) {
    throw new BuilderApiError(403, "admin_self_delete", "Admins cannot delete their own league data; ask another admin.");
  }
  return deleteBuilderData(db, request.userId, { actorId: request.userId, actorRole: "member", bucket: request.bucket, now: request.now });
}
