/** Read model behind `/api/v1/operator/system/jobs`: queue health without user ids, emails or payloads. */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { onboardingJobs } from "@/lib/db/schema";
import { jobStats, listJobs, type OnboardingJob } from "@/lib/onboarding/jobs";

/** A job without its payload beyond the community target. */
export function redactJob(job: OnboardingJob) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    target: typeof job.payload?.target === "string" ? job.payload.target : null,
    lastError: job.lastError,
    nextRunAt: job.nextRunAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function listJobHealth(db: AppDb, now: Date) {
  const [stats, dead, failed] = await Promise.all([
    jobStats(db, now),
    listJobs(db, { status: "dead", limit: 50 }),
    db
      .select()
      .from(onboardingJobs)
      .where(and(eq(onboardingJobs.status, "pending"), isNotNull(onboardingJobs.lastError)))
      .orderBy(desc(onboardingJobs.updatedAt))
      .limit(50),
  ]);
  return { stats: { ...stats, oldestDueAt: stats.oldestDueAt?.toISOString() ?? null }, dead: dead.map(redactJob), failed: failed.map(redactJob) };
}
