import { getDb, type AppDb } from "@/lib/db";
import {
  products,
  productRevisions,
  submissions,
  moderationCases,
  moderationChecks,
  moderationDecisions,
  domainEvents,
  outboxEvents,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { safeFetchUrl } from "@/lib/moderation/safe-fetch";
import { screenListingWithAi } from "@/lib/moderation/ai";
import crypto from "crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { recordDirectoryLaunchSafely } from "@/lib/builder-league/directory-events";

export interface SubmitForReviewParams {
  productId: string;
  revisionId: string;
  submitterId: string;
  submissionNotes?: string;
  isFastTrack?: boolean;
}

export interface ModerationDecisionParams {
  caseId: string;
  decision: "approved" | "changes_requested" | "rejected" | "quarantined";
  reasonCodes: string[];
  humanReviewerId: string;
  reviewerRole: string;
  notes?: string;
}

/**
 * Submit a product revision for human review.
 */
export async function submitRevisionForReview(params: SubmitForReviewParams, customDb?: AppDb) {
  const db = customDb || getDb();

  // Submission, case and status flips are applied in one atomic D1 batch (ids pre-generated).
  const submissionId = crypto.randomUUID();
  const [[submission], [modCase]] = await db.batch([
    db
      .insert(submissions)
      .values({
        id: submissionId,
        productId: params.productId,
        revisionId: params.revisionId,
        submitterId: params.submitterId,
        status: "automated_checks",
        submissionNotes: params.submissionNotes,
      })
      .returning(),
    db
      .insert(moderationCases)
      .values({
        submissionId,
        priority: params.isFastTrack ? "fast_track" : "normal",
        status: "open",
      })
      .returning(),
    db
      .update(products)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(products.id, params.productId)),
    db
      .update(productRevisions)
      .set({ status: "submitted" })
      .where(eq(productRevisions.id, params.revisionId)),
  ]);

  return { submission, modCase };
}

/**
 * Execute automated checks (Safe Fetch + Advisory AI) on a moderation case.
 */
export async function executeAutomatedChecks(
  {
    caseId,
    websiteUrl,
    title,
    tagline,
    description,
  }: {
    caseId: string;
    websiteUrl: string;
    title: string;
    tagline: string;
    description: string;
  },
  customDb?: AppDb
) {
  const db = customDb || getDb();

  // 1. Run SSRF safe fetch check on website URL
  const fetchCheck = await safeFetchUrl(websiteUrl);
  await db.insert(moderationChecks).values({
    caseId,
    checkType: "safe_fetch",
    status: fetchCheck.ok ? "passed" : "failed",
    details: { url: websiteUrl, status: fetchCheck.status, error: fetchCheck.error },
  });

  // 2. Run advisory AI content screening
  const aiReport = await screenListingWithAi({ title, tagline, description, websiteUrl });
  await db.insert(moderationChecks).values({
    caseId,
    checkType: "ai_safety",
    status: aiReport.isClean ? "passed" : "warning",
    details: aiReport as unknown as Record<string, unknown>,
  });

  // 3. Update case summary and move to awaiting human review
  await db
    .update(moderationCases)
    .set({
      status: "in_review",
      aiAnalysisSummary: aiReport as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(moderationCases.id, caseId));

  const [modCase] = await db.select().from(moderationCases).where(eq(moderationCases.id, caseId)).limit(1);
  if (modCase) {
    await db
      .update(submissions)
      .set({ status: "awaiting_human" })
      .where(eq(submissions.id, modCase.submissionId));
  }

  return { fetchCheck, aiReport };
}

/**
 * Builder League SHIP launch for the submitter of a first approval. Best-effort and off the response
 * path: inside the Worker it continues through `waitUntil`; elsewhere (tests, scripts) it finishes
 * inline. `recordDirectoryLaunchSafely` never throws, so the decision itself is never affected.
 */
async function scheduleBuilderLaunch(db: AppDb, input: Parameters<typeof recordDirectoryLaunchSafely>[1]): Promise<void> {
  const task = recordDirectoryLaunchSafely(db, input);
  try {
    getCloudflareContext().ctx.waitUntil(task);
    return;
  } catch {
    // No Worker request context.
  }
  await task;
}

/**
 * Record a named human moderation decision with immutable audit trail.
 */
export async function recordModerationDecision(params: ModerationDecisionParams, customDb?: AppDb) {
  const db = customDb || getDb();

  if (!params.humanReviewerId) {
    throw new Error("Human reviewer ID is required. Autonomous AI approval is prohibited under policy.");
  }

  // Reads first, then every write in one atomic D1 batch (D1 has no interactive transactions).
  const [modCase] = await db.select().from(moderationCases).where(eq(moderationCases.id, params.caseId)).limit(1);
  if (!modCase) {
    throw new Error(`Moderation case not found: ${params.caseId}`);
  }

  const [submission] = await db.select().from(submissions).where(eq(submissions.id, modCase.submissionId)).limit(1);
  if (!submission) {
    throw new Error(`Submission not found for case: ${params.caseId}`);
  }

  const [revision] = await db
    .select()
    .from(productRevisions)
    .where(eq(productRevisions.id, submission.revisionId))
    .limit(1);

  // Compute immutable decision hash
  const timestamp = new Date().toISOString();
  const decisionHash = crypto
    .createHash("sha256")
    .update(
      `${params.caseId}:${params.decision}:${params.humanReviewerId}:${params.reviewerRole}:${revision?.contentHash || ""}:${timestamp}`
    )
    .digest("hex");

  const now = new Date();
  const decisionInsert = db
    .insert(moderationDecisions)
    .values({
      caseId: params.caseId,
      decision: params.decision,
      reasonCodes: params.reasonCodes,
      humanReviewerId: params.humanReviewerId,
      reviewerRole: params.reviewerRole,
      notes: params.notes,
      decisionHash,
    })
    .returning();
  const caseUpdate = db
    .update(moderationCases)
    .set({ status: "decided", updatedAt: now })
    .where(eq(moderationCases.id, params.caseId));
  const submissionUpdate = db
    .update(submissions)
    .set({ status: params.decision, reviewedAt: now })
    .where(eq(submissions.id, submission.id));

  if (params.decision === "approved") {
    // Publish product, promote the candidate revision and emit listing.published + outbox atomically.
    const eventId = `evt_${crypto.randomUUID()}`;
    const [[decision]] = await db.batch([
      decisionInsert,
      caseUpdate,
      submissionUpdate,
      db.update(productRevisions).set({ status: "approved" }).where(eq(productRevisions.id, submission.revisionId)),
      db
        .update(products)
        .set({ status: "published", currentRevisionId: submission.revisionId, updatedAt: now })
        .where(eq(products.id, submission.productId)),
      db.insert(domainEvents).values({
        eventId,
        eventType: "listing.published",
        aggregateType: "product",
        aggregateId: submission.productId,
        aggregateVersion: revision?.revisionNumber || 1,
        payload: {
          productId: submission.productId,
          revisionId: submission.revisionId,
          contentHash: revision?.contentHash,
          decisionHash,
          approvedBy: params.humanReviewerId,
        },
        actorId: params.humanReviewerId,
        actorRole: params.reviewerRole,
      }),
      db.insert(outboxEvents).values({
        eventId,
        eventType: "listing.published",
        targetQueue: "nlb-distribution",
        payload: { productId: submission.productId, revisionId: submission.revisionId },
        status: "pending",
      }),
    ]);
    await scheduleBuilderLaunch(db, { submissionId: submission.id, productId: submission.productId, submitterId: submission.submitterId, approvedAt: now });
    return decision;
  }

  const [[decision]] = await db.batch([
    decisionInsert,
    caseUpdate,
    submissionUpdate,
    db.update(productRevisions).set({ status: params.decision }).where(eq(productRevisions.id, submission.revisionId)),
    db.update(products).set({ status: params.decision, updatedAt: now }).where(eq(products.id, submission.productId)),
  ]);
  return decision;
}
