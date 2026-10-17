import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { onboardingJobs, type OnboardingJobKind, type OnboardingJobStatus } from "@/lib/db/schema";
import { COMMUNITY_TARGETS, ProviderError, type CommunityTarget } from "@/lib/community/types";

export type OnboardingJob = typeof onboardingJobs.$inferSelect;

export const JOB_MAX_ATTEMPTS = 10;
export const JOB_BASE_BACKOFF_MS = 30_000;
export const JOB_MAX_BACKOFF_MS = 60 * 60 * 1000;
export const DEFAULT_JOB_LEASE_MS = 60_000;

export interface EnqueueJobInput {
  kind: OnboardingJobKind;
  dedupeKey: string;
  payload: Record<string, unknown>;
  runAt?: Date;
  /**
   * One-shot work (a welcome email): a second enqueue with the same key is ignored, even after the
   * job finished. Otherwise the existing row is reset to `pending` with fresh attempts.
   */
  onlyOnce?: boolean;
}

/**
 * Upsert a job by `dedupe_key`. Re-enqueueing a running job flips it back to `pending` but keeps
 * its lease, so the in-flight run cannot mark it done and it runs again once the lease is released.
 */
export async function enqueueJob(db: AppDb, input: EnqueueJobInput, now: Date = new Date()): Promise<void> {
  const runAt = input.runAt ?? now;
  const insert = db.insert(onboardingJobs).values({
    kind: input.kind,
    dedupeKey: input.dedupeKey,
    payload: input.payload,
    status: "pending",
    attempts: 0,
    nextRunAt: runAt,
    createdAt: now,
    updatedAt: now,
  });
  if (input.onlyOnce) {
    await insert.onConflictDoNothing({ target: onboardingJobs.dedupeKey });
    return;
  }
  await insert.onConflictDoUpdate({
    target: onboardingJobs.dedupeKey,
    set: {
      payload: input.payload,
      status: "pending",
      attempts: 0,
      nextRunAt: runAt,
      lastError: null,
      updatedAt: now,
    },
  });
}

/** Queue access reconciliation for a user on the given targets (both by default). */
export async function enqueueAccessReconcile(
  db: AppDb,
  userId: string,
  targets: readonly CommunityTarget[] = COMMUNITY_TARGETS,
  now: Date = new Date()
): Promise<void> {
  for (const target of targets) {
    await enqueueJob(
      db,
      { kind: "reconcile_access", dedupeKey: `reconcile_access:${userId}:${target}`, payload: { userId, target } },
      now
    );
  }
}

const leaseFree = (now: Date) => or(isNull(onboardingJobs.lockedUntil), lt(onboardingJobs.lockedUntil, now));

/**
 * Claim up to `limit` due jobs with a lease. A job is claimable when it is pending and due, or when
 * it is `running` but its lease expired (the worker died). Each claim is a conditional UPDATE, so
 * concurrent runners never get the same job. Attempts are counted at claim time, which also bounds
 * jobs that crash the worker; such a job at the attempt limit is marked dead instead.
 */
export async function claimDueJobs(
  db: AppDb,
  limit: number,
  leaseMs: number = DEFAULT_JOB_LEASE_MS,
  now: Date = new Date()
): Promise<OnboardingJob[]> {
  const claimable = and(
    leaseFree(now),
    or(
      and(eq(onboardingJobs.status, "pending"), lte(onboardingJobs.nextRunAt, now)),
      eq(onboardingJobs.status, "running")
    )
  );

  await db
    .update(onboardingJobs)
    .set({ status: "dead", lockedUntil: null, lastError: "lease_expired", updatedAt: now })
    .where(and(claimable, sql`${onboardingJobs.attempts} >= ${JOB_MAX_ATTEMPTS}`));

  const candidates = await db
    .select({ id: onboardingJobs.id })
    .from(onboardingJobs)
    .where(claimable)
    .orderBy(asc(onboardingJobs.nextRunAt))
    .limit(limit);

  const lockedUntil = new Date(now.getTime() + leaseMs);
  const claimed: OnboardingJob[] = [];
  for (const { id } of candidates) {
    const [job] = await db
      .update(onboardingJobs)
      .set({ status: "running", lockedUntil, attempts: sql`${onboardingJobs.attempts} + 1`, updatedAt: now })
      .where(and(eq(onboardingJobs.id, id), claimable))
      .returning();
    if (job) claimed.push(job);
  }
  return claimed;
}

/** Owned by this claim: same row, same lease. A lost or re-taken lease makes every write a no-op. */
const ownedBy = (job: OnboardingJob) =>
  and(eq(onboardingJobs.id, job.id), eq(onboardingJobs.lockedUntil, job.lockedUntil ?? new Date(0)));

/** Release the lease without changing status (used when the job was re-enqueued mid-run). */
async function releaseLease(db: AppDb, job: OnboardingJob, now: Date): Promise<void> {
  await db.update(onboardingJobs).set({ lockedUntil: null, updatedAt: now }).where(ownedBy(job));
}

export async function completeJob(db: AppDb, job: OnboardingJob, now: Date = new Date()): Promise<void> {
  const done = await db
    .update(onboardingJobs)
    .set({ status: "done", lockedUntil: null, lastError: null, updatedAt: now })
    .where(and(ownedBy(job), eq(onboardingJobs.status, "running")))
    .run();
  if (done.meta.changes === 0) await releaseLease(db, job, now);
}

/** 30s · 2^(attempt-1), capped at one hour. */
export function backoffMs(attempts: number): number {
  return Math.min(JOB_BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), JOB_MAX_BACKOFF_MS);
}

/** Error text safe to store: provider codes as-is, anything else with emails and long tokens removed. */
export function redactError(error: unknown): string {
  if (error instanceof ProviderError) return error.code;
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : "unknown_error";
  return raw
    .replace(/[^\s@]+@[^\s@]+/g, "[email]")
    .replace(/[A-Za-z0-9_\-.=+/]{24,}/g, "[redacted]")
    .slice(0, 200);
}

/**
 * Record a failed attempt. Retryable failures go back to `pending` after exponential backoff (or the
 * provider's retry-after, whichever is longer); permanent ones and the tenth attempt go `dead`.
 */
export async function failJob(
  db: AppDb,
  job: OnboardingJob,
  error: unknown,
  now: Date = new Date()
): Promise<OnboardingJobStatus> {
  const retryable = error instanceof ProviderError ? error.retryable : true;
  const retryAfterMs = error instanceof ProviderError ? (error.retryAfterMs ?? 0) : 0;
  const dead = !retryable || job.attempts >= JOB_MAX_ATTEMPTS;
  const status: OnboardingJobStatus = dead ? "dead" : "pending";
  const result = await db
    .update(onboardingJobs)
    .set({
      status,
      lockedUntil: null,
      lastError: redactError(error),
      nextRunAt: dead ? job.nextRunAt : new Date(now.getTime() + Math.max(backoffMs(job.attempts), retryAfterMs)),
      updatedAt: now,
    })
    .where(and(ownedBy(job), eq(onboardingJobs.status, "running")))
    .run();
  if (result.meta.changes === 0) {
    await releaseLease(db, job, now);
    return "pending";
  }
  return status;
}

/** Put a dead (or finished) job back in the queue with fresh attempts. Running jobs are left alone. */
export async function retryJob(db: AppDb, id: string, now: Date = new Date()): Promise<boolean> {
  const result = await db
    .update(onboardingJobs)
    .set({ status: "pending", attempts: 0, nextRunAt: now, lockedUntil: null, lastError: null, updatedAt: now })
    .where(and(eq(onboardingJobs.id, id), inArray(onboardingJobs.status, ["dead", "done", "pending"])))
    .run();
  return result.meta.changes === 1;
}

export interface JobStats {
  byStatus: Record<OnboardingJobStatus, number>;
  byKind: Record<OnboardingJobKind, Record<OnboardingJobStatus, number>>;
  /** Oldest due pending job, a backlog signal for the admin view. */
  oldestDueAt: Date | null;
}

export async function jobStats(db: AppDb, now: Date = new Date()): Promise<JobStats> {
  const emptyStatus = (): Record<OnboardingJobStatus, number> => ({ pending: 0, running: 0, done: 0, dead: 0 });
  const stats: JobStats = {
    byStatus: emptyStatus(),
    byKind: { reconcile_access: emptyStatus(), welcome_email: emptyStatus(), admin_notify: emptyStatus() },
    oldestDueAt: null,
  };
  const rows = await db
    .select({ kind: onboardingJobs.kind, status: onboardingJobs.status, count: sql<number>`count(*)` })
    .from(onboardingJobs)
    .groupBy(onboardingJobs.kind, onboardingJobs.status);
  for (const row of rows) {
    stats.byStatus[row.status] = (stats.byStatus[row.status] ?? 0) + Number(row.count);
    const kind = stats.byKind[row.kind];
    if (kind) kind[row.status] = (kind[row.status] ?? 0) + Number(row.count);
  }
  const [oldest] = await db
    .select({ nextRunAt: onboardingJobs.nextRunAt })
    .from(onboardingJobs)
    .where(and(eq(onboardingJobs.status, "pending"), lte(onboardingJobs.nextRunAt, now)))
    .orderBy(asc(onboardingJobs.nextRunAt))
    .limit(1);
  stats.oldestDueAt = oldest?.nextRunAt ?? null;
  return stats;
}

/** Jobs in one status, newest first (admin listing of dead jobs). Payloads hold ids only. */
export async function listJobs(db: AppDb, { status, limit = 50 }: { status: OnboardingJobStatus; limit?: number }) {
  return db
    .select()
    .from(onboardingJobs)
    .where(eq(onboardingJobs.status, status))
    .orderBy(sql`${onboardingJobs.updatedAt} desc`)
    .limit(limit);
}
