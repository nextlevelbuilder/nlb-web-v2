/**
 * Read models behind the content operator routes (`/api/v1/operator/assets`, `/directory`). Writes never
 * happen here: they go through the Courses, media and moderation domain services.
 */
import { and, desc, eq, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { assets, moderationCases, productRevisions, products, submissions } from "@/lib/db/schema";
import { toMemberAsset, type AssetRow } from "@/lib/access/http/member-queries";
import { toPublicCourseVideo, type CourseVideoRow } from "@/lib/courses/course-video-service";

/** A Courses video with the fields only operators see. */
export function toOperatorVideo(video: CourseVideoRow) {
  return {
    ...toPublicCourseVideo(video),
    status: video.status,
    streamUid: video.streamUid ?? null,
    polarProductId: video.polarProductId ?? null,
    updatedAt: video.updatedAt.toISOString(),
  };
}

/** Operators see the storage key too (it is what gets promoted); never the raw bytes. */
export function toOperatorAsset(asset: AssetRow) {
  return { ...toMemberAsset(asset), storageKey: asset.storageKey, checksumSha256: asset.checksumSha256 };
}

export function listAssets(db: AppDb, filter: { status: string | null; orgId: string | null; limit: number }): Promise<AssetRow[]> {
  const where: SQL[] = [];
  if (filter.status) where.push(eq(assets.status, filter.status));
  if (filter.orgId) where.push(eq(assets.orgId, filter.orgId));
  return db
    .select()
    .from(assets)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(assets.createdAt))
    .limit(filter.limit);
}

/** Moderation cases with their product and revision, highest priority first. */
export function listModerationCases(db: AppDb, filter: { status: string; limit: number }) {
  return db
    .select({
      caseId: moderationCases.id,
      priority: moderationCases.priority,
      status: moderationCases.status,
      aiAnalysisSummary: moderationCases.aiAnalysisSummary,
      createdAt: moderationCases.createdAt,
      submissionId: submissions.id,
      submitterId: submissions.submitterId,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      revisionId: productRevisions.id,
      revisionNumber: productRevisions.revisionNumber,
      contentHash: productRevisions.contentHash,
    })
    .from(moderationCases)
    .innerJoin(submissions, eq(moderationCases.submissionId, submissions.id))
    .innerJoin(products, eq(submissions.productId, products.id))
    .innerJoin(productRevisions, eq(submissions.revisionId, productRevisions.id))
    .where(eq(moderationCases.status, filter.status))
    .orderBy(desc(moderationCases.priority), desc(moderationCases.createdAt))
    .limit(filter.limit);
}

export async function getModerationCase(db: AppDb, caseId: string) {
  const [row] = await db.select().from(moderationCases).where(eq(moderationCases.id, caseId)).limit(1);
  return row ?? null;
}

/** Directory products of every organization, optionally one status, most recently updated first. */
export function listProducts(db: AppDb, filter: { status: string | null; limit: number }) {
  return db
    .select({
      id: products.id,
      orgId: products.orgId,
      slug: products.slug,
      title: products.title,
      tagline: products.tagline,
      websiteUrl: products.websiteUrl,
      status: products.status,
      isFeatured: products.isFeatured,
      currentRevisionId: products.currentRevisionId,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(filter.status ? eq(products.status, filter.status) : undefined)
    .orderBy(desc(products.updatedAt))
    .limit(filter.limit);
}
