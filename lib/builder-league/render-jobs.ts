/**
 * Year in Review video render queue (`render_jobs`). The Worker only queues, leases and stores; the
 * rendering itself runs outside it (`scripts/builder-league/render-year-video.ts`, from GitHub Actions
 * or an admin machine).
 *
 * - One job per snapshot and format (`dedupe_key`), so repeated requests return the same job.
 * - A renderer claims a job with a lease (`locked_until`). The lease value is the claim token: a
 *   renderer whose lease was taken over can neither complete nor fail the job.
 * - Failures retry with exponential backoff (the job waits as `queued` until `locked_until`), up to
 *   `MAX_ATTEMPTS`, then stay `failed`. The owner may request a failed or expired job again.
 * - Outputs live in the private `BUILDER_EVIDENCE` bucket under `renders/{userId}/{year}/{jobId}.mp4`
 *   (plus a `.png` still), are downloadable by the owner only, and expire after `OUTPUT_RETENTION_DAYS`.
 */
import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveCaller } from "@/lib/auth-api-key";
import type { AppDb } from "@/lib/db";
import { renderJobs, users, yearlySnapshots } from "@/lib/db/schema";
import { BuilderApiError } from "./http";
import { getLatestYearSnapshot, snapshotData, toPublicYearReview, type PublicYearReview } from "./year-review";

export type RenderJob = typeof renderJobs.$inferSelect;
export type RenderFormat = RenderJob["format"];
export const RENDER_FORMATS: readonly RenderFormat[] = ["9x16", "16x9"];

export const MAX_ATTEMPTS = 5;
export const LEASE_MS = 15 * 60 * 1000;
export const OUTPUT_RETENTION_DAYS = 30;
/** Queued jobs nobody rendered within this window expire instead of waiting forever. */
export const QUEUED_TTL_DAYS = 14;
const DAY_MS = 86_400_000;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_POSTER_BYTES = 5 * 1024 * 1024;

/** The subset of R2 the queue needs; tests pass an in-memory implementation. */
export interface RenderBucket {
  put(key: string, value: ArrayBuffer | ReadableStream | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null>;
  delete(keys: string | string[]): Promise<void>;
}

/** The private `BUILDER_EVIDENCE` bucket of the current request; throws 503 when it is not bound. */
export function getRenderBucket(): RenderBucket {
  let bucket: RenderBucket | undefined;
  try {
    bucket = (getCloudflareContext().env as unknown as { BUILDER_EVIDENCE?: RenderBucket }).BUILDER_EVIDENCE;
  } catch {
    bucket = undefined;
  }
  if (!bucket) throw new BuilderApiError(503, "storage_unavailable", "Render storage is not configured.");
  return bucket;
}

export function isRenderFormat(value: string): value is RenderFormat {
  return (RENDER_FORMATS as readonly string[]).includes(value);
}

export function renderDedupeKey(snapshotId: string, format: RenderFormat): string {
  return `${snapshotId}|${format}`;
}

export function renderOutputKey(job: Pick<RenderJob, "userId" | "year" | "id">, part: "video" | "poster"): string {
  return `renders/${job.userId}/${job.year}/${job.id}.${part === "video" ? "mp4" : "png"}`;
}

/** Backoff after the n-th failed attempt: 2, 4, 8, 16 … minutes, capped at 6 hours. */
export function retryDelayMs(attempts: number): number {
  return Math.min(2 ** Math.max(attempts, 1) * 60_000, 6 * 60 * 60 * 1000);
}

async function getJob(db: AppDb, id: string): Promise<RenderJob | null> {
  const [job] = await db.select().from(renderJobs).where(eq(renderJobs.id, id)).limit(1);
  return job ?? null;
}

/**
 * Queues a render of the member's latest snapshot for the year. Idempotent per snapshot and format: an
 * active or finished job is returned as is; a failed or expired one is re-queued.
 */
export async function requestRender(
  db: AppDb,
  input: { userId: string; year: number; format: RenderFormat; now?: Date }
): Promise<{ job: RenderJob; created: boolean }> {
  const now = input.now ?? new Date();
  const snapshot = await getLatestYearSnapshot(db, input.userId, input.year);
  if (!snapshot) throw new BuilderApiError(404, "snapshot_not_found", "No Year in Review for this year yet.");
  const publicView = toPublicYearReview(snapshotData(snapshot), snapshot.hiddenScenes);
  if (publicView.scenes.length === 0) {
    throw new BuilderApiError(409, "nothing_to_render", "Make at least one milestone public (and not hidden) before rendering a video.");
  }
  const dedupeKey = renderDedupeKey(snapshot.id, input.format);
  const [inserted] = await db
    .insert(renderJobs)
    .values({ userId: input.userId, year: input.year, snapshotId: snapshot.id, format: input.format, dedupeKey, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { job: inserted, created: true };

  const [existing] = await db.select().from(renderJobs).where(eq(renderJobs.dedupeKey, dedupeKey)).limit(1);
  if (existing.status !== "failed" && existing.status !== "expired") return { job: existing, created: false };
  const [requeued] = await db
    .update(renderJobs)
    .set({ status: "queued", attempts: 0, lockedUntil: null, error: null, outputKey: null, expiresAt: null, updatedAt: now })
    .where(and(eq(renderJobs.id, existing.id), inArray(renderJobs.status, ["failed", "expired"])))
    .returning();
  return { job: requeued ?? (await getJob(db, existing.id))!, created: Boolean(requeued) };
}

export async function listRenderJobs(db: AppDb, userId: string, year: number): Promise<RenderJob[]> {
  return db
    .select()
    .from(renderJobs)
    .where(and(eq(renderJobs.userId, userId), eq(renderJobs.year, year)))
    .orderBy(desc(renderJobs.createdAt));
}

export interface ClaimedRender {
  job: RenderJob;
  /** Pass back on complete/fail; it is the job's `locked_until` in epoch ms. */
  lease: number;
  displayName: string;
  review: PublicYearReview;
}

/**
 * Leases the oldest job that is due: queued and past its backoff, or claimed with an expired lease.
 * The conditional UPDATE is the compare-and-swap that keeps two renderers off the same job.
 */
export async function claimNextRenderJob(db: AppDb, now = new Date()): Promise<ClaimedRender | null> {
  const due = or(
    and(eq(renderJobs.status, "queued"), or(isNull(renderJobs.lockedUntil), lte(renderJobs.lockedUntil, now))),
    and(eq(renderJobs.status, "claimed"), lte(renderJobs.lockedUntil, now))
  );
  const candidates = await db.select().from(renderJobs).where(due).orderBy(asc(renderJobs.createdAt), asc(renderJobs.id)).limit(10);
  for (const candidate of candidates) {
    if (candidate.attempts >= MAX_ATTEMPTS) {
      await db
        .update(renderJobs)
        .set({ status: "failed", lockedUntil: null, error: candidate.error ?? "lease expired too often", updatedAt: now })
        .where(and(eq(renderJobs.id, candidate.id), eq(renderJobs.attempts, candidate.attempts)));
      continue;
    }
    const lease = now.getTime() + LEASE_MS;
    const [claimed] = await db
      .update(renderJobs)
      .set({ status: "claimed", lockedUntil: new Date(lease), attempts: candidate.attempts + 1, updatedAt: now })
      .where(and(eq(renderJobs.id, candidate.id), eq(renderJobs.attempts, candidate.attempts), due))
      .returning();
    if (!claimed) continue;
    const [snapshot] = await db.select().from(yearlySnapshots).where(eq(yearlySnapshots.id, claimed.snapshotId)).limit(1);
    if (!snapshot) {
      await failRenderJob(db, { id: claimed.id, lease, error: "snapshot missing", now, permanent: true });
      continue;
    }
    const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, claimed.userId)).limit(1);
    return { job: claimed, lease, displayName: owner?.name ?? "", review: toPublicYearReview(snapshotData(snapshot), snapshot.hiddenScenes) };
  }
  return null;
}

async function requireLease(db: AppDb, id: string, lease: number): Promise<RenderJob> {
  const job = await getJob(db, id);
  if (!job) throw new BuilderApiError(404, "job_not_found", "Render job not found.");
  if (job.status !== "claimed" || job.lockedUntil?.getTime() !== lease) {
    throw new BuilderApiError(409, "lease_lost", "This render job is no longer leased to you.");
  }
  return job;
}

/** Stores the outputs and marks the job done. Requires the current lease. */
export async function completeRenderJob(
  db: AppDb,
  bucket: RenderBucket,
  input: { id: string; lease: number; video: ArrayBuffer; poster?: ArrayBuffer | null; now?: Date }
): Promise<RenderJob> {
  const now = input.now ?? new Date();
  const job = await requireLease(db, input.id, input.lease);
  if (input.video.byteLength === 0 || input.video.byteLength > MAX_VIDEO_BYTES) {
    throw new BuilderApiError(413, "invalid_video", "The video is empty or larger than 80 MB.");
  }
  if (input.poster && input.poster.byteLength > MAX_POSTER_BYTES) throw new BuilderApiError(413, "invalid_poster", "The poster is larger than 5 MB.");
  const videoKey = renderOutputKey(job, "video");
  await bucket.put(videoKey, input.video, { httpMetadata: { contentType: "video/mp4" } });
  if (input.poster && input.poster.byteLength > 0) {
    await bucket.put(renderOutputKey(job, "poster"), input.poster, { httpMetadata: { contentType: "image/png" } });
  }
  const [done] = await db
    .update(renderJobs)
    .set({ status: "done", outputKey: videoKey, error: null, lockedUntil: null, expiresAt: new Date(now.getTime() + OUTPUT_RETENTION_DAYS * DAY_MS), updatedAt: now })
    .where(and(eq(renderJobs.id, job.id), eq(renderJobs.status, "claimed"), eq(renderJobs.lockedUntil, new Date(input.lease))))
    .returning();
  if (!done) {
    await bucket.delete([videoKey, renderOutputKey(job, "poster")]);
    throw new BuilderApiError(409, "lease_lost", "This render job is no longer leased to you.");
  }
  return done;
}

/** Records a failure: retries later with backoff, or gives up after `MAX_ATTEMPTS` (or `permanent`). */
export async function failRenderJob(
  db: AppDb,
  input: { id: string; lease: number; error: string; now?: Date; permanent?: boolean }
): Promise<RenderJob> {
  const now = input.now ?? new Date();
  const job = await requireLease(db, input.id, input.lease);
  const giveUp = input.permanent || job.attempts >= MAX_ATTEMPTS;
  const [updated] = await db
    .update(renderJobs)
    .set({
      status: giveUp ? "failed" : "queued",
      lockedUntil: giveUp ? null : new Date(now.getTime() + retryDelayMs(job.attempts)),
      error: input.error.slice(0, 500),
      updatedAt: now,
    })
    .where(and(eq(renderJobs.id, job.id), eq(renderJobs.status, "claimed"), eq(renderJobs.lockedUntil, new Date(input.lease))))
    .returning();
  if (!updated) throw new BuilderApiError(409, "lease_lost", "This render job is no longer leased to you.");
  return updated;
}

/**
 * Retention: deletes outputs past `expires_at`, and expires queued jobs nobody rendered within
 * `QUEUED_TTL_DAYS` and failed jobs older than the output retention. Returns the number expired.
 */
export async function expireRenderJobs(db: AppDb, bucket: RenderBucket | null, now = new Date()): Promise<number> {
  const stale = await db
    .select()
    .from(renderJobs)
    .where(or(
      and(eq(renderJobs.status, "done"), lte(renderJobs.expiresAt, now)),
      and(eq(renderJobs.status, "queued"), lte(renderJobs.createdAt, new Date(now.getTime() - QUEUED_TTL_DAYS * DAY_MS))),
      and(eq(renderJobs.status, "failed"), lte(renderJobs.updatedAt, new Date(now.getTime() - OUTPUT_RETENTION_DAYS * DAY_MS)))
    ))
    .limit(200);
  let expired = 0;
  for (const job of stale) {
    if (job.status === "done") {
      if (!bucket) continue; // never drop the pointer while the object cannot be deleted
      await bucket.delete([renderOutputKey(job, "video"), renderOutputKey(job, "poster")]);
    }
    const [row] = await db
      .update(renderJobs)
      .set({ status: "expired", outputKey: null, lockedUntil: null, updatedAt: now })
      .where(and(eq(renderJobs.id, job.id), eq(renderJobs.status, job.status)))
      .returning({ id: renderJobs.id });
    if (row) expired += 1;
  }
  return expired;
}

/** The owner's finished output, or a 404 for anything else (another member's job included). */
export async function getRenderDownload(
  db: AppDb,
  bucket: RenderBucket,
  input: { userId: string; year: number; jobId: string; part: "video" | "poster"; now?: Date }
): Promise<{ body: ReadableStream; size: number; contentType: string; filename: string }> {
  const now = input.now ?? new Date();
  const job = await getJob(db, input.jobId);
  if (!job || job.userId !== input.userId || job.year !== input.year || job.status !== "done" || (job.expiresAt && job.expiresAt <= now)) {
    throw new BuilderApiError(404, "not_found", "Not found");
  }
  const object = await bucket.get(renderOutputKey(job, input.part));
  if (!object) throw new BuilderApiError(404, "not_found", "Not found");
  const ext = input.part === "video" ? "mp4" : "png";
  return {
    body: object.body,
    size: object.size,
    contentType: input.part === "video" ? "video/mp4" : "image/png",
    filename: `nlb-year-${job.year}-${job.format}.${ext}`,
  };
}

/** API view of a job: no storage keys or lease internals. */
export function serializeRenderJob(job: RenderJob) {
  return {
    id: job.id,
    year: job.year,
    format: job.format,
    status: job.status,
    attempts: job.attempts,
    error: job.status === "failed" ? job.error : null,
    expiresAt: job.expiresAt ? job.expiresAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/** Renderer/admin view: includes the snapshot id and lease expiry, still no storage keys. */
export function serializeRenderJobForAdmin(job: RenderJob) {
  return { ...serializeRenderJob(job), userId: job.userId, snapshotId: job.snapshotId, error: job.error, lockedUntil: job.lockedUntil?.toISOString() ?? null };
}

export async function listRenderJobsForAdmin(db: AppDb, status?: RenderJob["status"]): Promise<RenderJob[]> {
  return db
    .select()
    .from(renderJobs)
    .where(status ? eq(renderJobs.status, status) : undefined)
    .orderBy(desc(renderJobs.createdAt))
    .limit(100);
}


/**
 * Renderer endpoints accept an admin's session or an admin's NLB API key (`NLB_RENDER_API_KEY` in the
 * GitHub workflow). MCP delegation and non-admin keys are refused. Returns the admin user id.
 */
export async function requireRenderer(request: Request, db: AppDb): Promise<string> {
  const caller = await resolveCaller(request.headers, db, { scope: "mcp:write", method: request.method, path: new URL(request.url).pathname });
  if (!caller?.user) throw new BuilderApiError(401, "unauthorized", "Sign in or send an admin API key.");
  if (caller.authType === "delegation" || caller.user.role !== "admin") throw new BuilderApiError(403, "admin_required", "Admin access required.");
  return caller.user.id;
}