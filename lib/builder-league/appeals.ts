/**
 * Appeals against rejected evidence. A member may appeal each rejection once; while an appeal is open no
 * second one can be filed (enforced in one `INSERT … SELECT … WHERE NOT EXISTS` statement, so two
 * concurrent appeals cannot both land). An admin other than the appellant resolves it: `uphold` keeps
 * the rejection, `overturn` approves the evidence through the normal approval path, with both steps in
 * the audit trail. An overturn checks the approval preconditions (for example a required counterparty
 * confirmation) before it closes the appeal, so it either goes through or fails with the appeal still
 * open. Resolution is idempotent and safe to retry.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { activityEvidence, evidenceAppeals, users } from "@/lib/db/schema";
import { BuilderApiError } from "./http";
import { auditIfChanged, getEvidence, type EvidenceAppeal } from "./evidence";
import { approveEvidence, assertApprovable, type ApprovalOutcome, type ModeratorActor } from "./moderation";

/** An overturn approves evidence that is still rejected. */
const OVERTURN_FROM = ["rejected"] as const;

export const AppealInputSchema = z.object({ reason: z.string().trim().min(20).max(2000) }).strict();

export const ResolveAppealSchema = z
  .object({
    outcome: z.enum(["uphold", "overturn"]),
    resolution: z.string().trim().min(5).max(2000),
  })
  .strict();

async function findAppeal(db: AppDb, appealId: string): Promise<EvidenceAppeal | null> {
  const [row] = await db.select().from(evidenceAppeals).where(eq(evidenceAppeals.id, appealId)).limit(1);
  return row ?? null;
}

/** Files an appeal against the member's own rejected evidence. */
export async function createAppeal(db: AppDb, userId: string, evidenceId: string, input: unknown): Promise<EvidenceAppeal> {
  const { reason } = AppealInputSchema.parse(input);
  const evidence = await getEvidence(db, evidenceId);
  if (!evidence || evidence.userId !== userId) throw new BuilderApiError(404, "not_found", "Evidence not found.");
  if (evidence.status !== "rejected") {
    throw new BuilderApiError(409, "not_appealable", "Only rejected evidence can be appealed.", { status: evidence.status });
  }
  const decidedAt = evidence.decidedAt?.getTime() ?? 0;
  const id = crypto.randomUUID();
  const now = Date.now();
  // One appeal per rejection and never two open at once, decided by SQLite in a single statement.
  await db.run(sql`insert into evidence_appeals (id, evidence_id, user_id, reason, status, created_at)
    select ${id}, ${evidenceId}, ${userId}, ${reason}, 'open', ${now}
    where not exists (
      select 1 from evidence_appeals
      where evidence_id = ${evidenceId} and (status = 'open' or created_at >= ${decidedAt})
    )`);
  const created = await findAppeal(db, id);
  if (created) return created;
  const [existing] = await db
    .select()
    .from(evidenceAppeals)
    .where(eq(evidenceAppeals.evidenceId, evidenceId))
    .orderBy(desc(evidenceAppeals.createdAt))
    .limit(1);
  throw new BuilderApiError(409, existing?.status === "open" ? "appeal_open" : "appeal_used", "This rejection has already been appealed.", {
    appealId: existing?.id,
    status: existing?.status,
  });
}

/** Open appeals, oldest first, with the evidence and the appellant's name. */
export async function listOpenAppeals(db: AppDb, limit = 50) {
  return db
    .select({ appeal: evidenceAppeals, evidence: activityEvidence, appellantName: users.name })
    .from(evidenceAppeals)
    .innerJoin(activityEvidence, eq(activityEvidence.id, evidenceAppeals.evidenceId))
    .innerJoin(users, eq(users.id, evidenceAppeals.userId))
    .where(eq(evidenceAppeals.status, "open"))
    .orderBy(asc(evidenceAppeals.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export interface AppealResolution {
  appeal: EvidenceAppeal;
  approval: ApprovalOutcome | null;
}

/**
 * Resolves the open appeal of an evidence (or a given appeal). Overturning approves the evidence; a
 * retry after a partial failure finishes the approval instead of failing on the closed appeal.
 */
export async function resolveAppeal(
  db: AppDb,
  target: { evidenceId: string; appealId?: string },
  input: unknown,
  actor: ModeratorActor
): Promise<AppealResolution> {
  if (actor.actorRole !== "admin" && actor.actorRole !== "moderator") {
    throw new BuilderApiError(403, "moderation_not_allowed", "Only moderators and admins can resolve appeals.");
  }
  const parsed = ResolveAppealSchema.parse(input);
  const appeal = target.appealId
    ? await findAppeal(db, target.appealId)
    : ((
        await db
          .select()
          .from(evidenceAppeals)
          .where(eq(evidenceAppeals.evidenceId, target.evidenceId))
          .orderBy(desc(evidenceAppeals.createdAt))
          .limit(1)
      )[0] ?? null);
  if (!appeal || appeal.evidenceId !== target.evidenceId) throw new BuilderApiError(404, "appeal_not_found", "No appeal for this evidence.");
  if (appeal.userId === actor.actorId) throw new BuilderApiError(403, "self_moderation", "You cannot resolve your own appeal.");

  const status = parsed.outcome === "uphold" ? "upheld" : "overturned";
  let current = appeal;
  if (appeal.status === "open") {
    // Never close an appeal as overturned when the approval it promises cannot happen.
    if (status === "overturned") assertApprovable(await getEvidence(db, appeal.evidenceId), actor, OVERTURN_FROM);
    const now = new Date();
    const [updated] = await db.batch([
      db
        .update(evidenceAppeals)
        .set({ status, resolution: parsed.resolution, resolvedBy: actor.actorId, resolvedAt: now })
        .where(and(eq(evidenceAppeals.id, appeal.id), eq(evidenceAppeals.status, "open")))
        .returning(),
      auditIfChanged(db, {
        targetType: "appeal",
        targetId: appeal.id,
        action: parsed.outcome,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        reasonCodes: [`appeal_${status}`],
        notes: parsed.resolution,
      }),
    ]);
    current = updated[0] ?? (await findAppeal(db, appeal.id)) ?? appeal;
  }
  if (current.status !== status) {
    throw new BuilderApiError(409, "appeal_resolved", `The appeal was already ${current.status}.`, { status: current.status });
  }
  if (status === "upheld") return { appeal: current, approval: null };

  const approval = await approveEvidence(db, appeal.evidenceId, actor, {
    fromStatuses: OVERTURN_FROM,
    reasonCodes: ["appeal_overturned"],
    note: parsed.resolution,
    auditAction: "approve_on_appeal",
  });
  return { appeal: current, approval };
}

export function toAppealDto(appeal: EvidenceAppeal) {
  return {
    id: appeal.id,
    evidenceId: appeal.evidenceId,
    status: appeal.status,
    reason: appeal.reason,
    resolution: appeal.resolution,
    createdAt: appeal.createdAt.toISOString(),
    resolvedAt: appeal.resolvedAt?.toISOString() ?? null,
  };
}
