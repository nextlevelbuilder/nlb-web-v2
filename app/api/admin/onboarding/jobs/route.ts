import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { onboardingJobs } from "@/lib/db/schema";
import { jobStats, listJobs, retryJob, type OnboardingJob } from "@/lib/onboarding/jobs";
import { getSessionUser } from "@/lib/onboarding/status";

export const dynamic = "force-dynamic";

/** Admin view of a job without user ids, emails or payload values beyond the community target. */
function redactJob(job: OnboardingJob) {
  const target = typeof job.payload?.target === "string" ? job.payload.target : null;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    target,
    lastError: job.lastError,
    nextRunAt: job.nextRunAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

async function requireAdmin(request: Request): Promise<Response | null> {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  return null;
}

/** Queue health: counts per status and kind, dead jobs and pending jobs that already failed once. */
export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const db = getDb();
  const [stats, dead, failed] = await Promise.all([
    jobStats(db),
    listJobs(db, { status: "dead", limit: 50 }),
    db
      .select()
      .from(onboardingJobs)
      .where(and(eq(onboardingJobs.status, "pending"), isNotNull(onboardingJobs.lastError)))
      .orderBy(desc(onboardingJobs.updatedAt))
      .limit(50),
  ]);
  return NextResponse.json(
    {
      stats: { ...stats, oldestDueAt: stats.oldestDueAt?.toISOString() ?? null },
      dead: dead.map(redactJob),
      failed: failed.map(redactJob),
    },
    { headers: { "cache-control": "no-store" } }
  );
}

const retrySchema = z.object({ id: z.string().min(1).max(64) });

/** Put a dead or finished job back in the queue with fresh attempts. */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const retried = await retryJob(getDb(), parsed.data.id);
  if (!retried) return NextResponse.json({ error: "not_retryable" }, { status: 409 });
  return NextResponse.json({ retried: true });
}
