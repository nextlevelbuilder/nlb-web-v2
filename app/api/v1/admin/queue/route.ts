import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { moderationCases, submissions, products, productRevisions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: Request) {
  // 1. Authenticate admin session
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if ((session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const db = getDb();
  try {
    const cases = await db
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
      .where(eq(moderationCases.status, "in_review"))
      .orderBy(desc(moderationCases.priority), desc(moderationCases.createdAt))
      .limit(50);

    return NextResponse.json({ data: cases });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load moderation queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
