import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { renderJobs, users } from "@/lib/db/schema";
import { ensureYearSnapshot } from "@/lib/builder-league/year-review";
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  OUTPUT_RETENTION_DAYS,
  claimNextRenderJob,
  completeRenderJob,
  expireRenderJobs,
  failRenderJob,
  getRenderDownload,
  requestRender,
  retryDelayMs,
  type RenderBucket,
} from "@/lib/builder-league/render-jobs";
import { local, seedEvent } from "./year-review-fixtures";

let t: LocalD1;
const DAY = 86_400_000;
const NOW = local(2026, 11, 20);

function memoryBucket() {
  const objects = new Map<string, ArrayBuffer>();
  const bucket: RenderBucket = {
    async put(key, value) {
      objects.set(key, value instanceof ArrayBuffer ? value : new TextEncoder().encode(String(value)).buffer as ArrayBuffer);
    },
    async get(key) {
      const value = objects.get(key);
      return value ? { body: new Blob([value]).stream(), size: value.byteLength } : null;
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
  };
  return { bucket, objects };
}
const bytes = (n: number) => new Uint8Array(n).fill(7).buffer;

beforeAll(async () => {
  t = await createLocalD1();
  await t.db.insert(users).values([
    { id: "u1", name: "Public builder", email: "u1@example.com" },
    { id: "u2", name: "Private builder", email: "u2@example.com" },
    { id: "mod", name: "Mod", email: "mod@example.com", role: "admin" },
  ]);
  await seedEvent(t.db, { id: "launch", eventType: "ship_product_launch", stage: "ship", occurredAt: local(2026, 6, 1), visibility: "public" });
  await seedEvent(t.db, { id: "u2-launch", subjectUserId: "u2", eventType: "ship_product_launch", stage: "ship", occurredAt: local(2026, 6, 1) });
  await ensureYearSnapshot(t.db, "u1", 2026, NOW);
  await ensureYearSnapshot(t.db, "u2", 2026, NOW);
});

afterAll(async () => {
  await t.dispose();
});

describe("render jobs", () => {
  it("refuses a render without a snapshot or without public scenes", async () => {
    await expect(requestRender(t.db, { userId: "u1", year: 2025, format: "9x16", now: NOW })).rejects.toMatchObject({ status: 404 });
    await expect(requestRender(t.db, { userId: "u2", year: 2026, format: "9x16", now: NOW })).rejects.toMatchObject({ status: 409, code: "nothing_to_render" });
  });

  it("is idempotent per snapshot and format", async () => {
    const first = await requestRender(t.db, { userId: "u1", year: 2026, format: "9x16", now: NOW });
    const again = await requestRender(t.db, { userId: "u1", year: 2026, format: "9x16", now: NOW });
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, job: { id: first.job.id } });
    const other = await requestRender(t.db, { userId: "u1", year: 2026, format: "16x9", now: new Date(NOW.getTime() + 1) });
    expect(other.job.id).not.toBe(first.job.id);
  });

  it("leases one job at a time, fences stale leases and retries with backoff", async () => {
    const { bucket } = memoryBucket();
    const claim = await claimNextRenderJob(t.db, NOW);
    expect(claim).toMatchObject({ job: { format: "9x16", status: "claimed", attempts: 1 }, lease: NOW.getTime() + LEASE_MS, displayName: "Public builder" });
    expect(claim!.review.milestones.map((m) => m.eventId)).toEqual(["launch"]);
    const second = await claimNextRenderJob(t.db, NOW);
    expect(second?.job.format).toBe("16x9");
    expect(await claimNextRenderJob(t.db, NOW)).toBeNull();

    const failed = await failRenderJob(t.db, { id: claim!.job.id, lease: claim!.lease, error: "ffmpeg crashed", now: NOW });
    expect(failed).toMatchObject({ status: "queued", error: "ffmpeg crashed" });
    expect(failed.lockedUntil?.getTime()).toBe(NOW.getTime() + retryDelayMs(1));
    await expect(completeRenderJob(t.db, bucket, { id: claim!.job.id, lease: claim!.lease, video: bytes(10), now: NOW })).rejects.toMatchObject({ status: 409, code: "lease_lost" });
    expect(await claimNextRenderJob(t.db, new Date(NOW.getTime() + 60_000))).toBeNull();

    // Lease expiry: the second job's renderer vanished; another renderer takes it over and the old lease is fenced.
    const takeoverAt = new Date(NOW.getTime() + LEASE_MS + 1);
    const takeover = await claimNextRenderJob(t.db, takeoverAt);
    expect(takeover).toBeTruthy();
    const takenIds = new Set([takeover!.job.id]);
    const another = await claimNextRenderJob(t.db, takeoverAt);
    if (another) takenIds.add(another.job.id);
    expect(takenIds.has(second!.job.id)).toBe(true);
    await expect(failRenderJob(t.db, { id: second!.job.id, lease: second!.lease, error: "late", now: takeoverAt })).rejects.toMatchObject({ code: "lease_lost" });
  });

  it("gives up after the maximum attempts", async () => {
    await t.db.update(renderJobs).set({ status: "queued", attempts: MAX_ATTEMPTS, lockedUntil: null }).where(eq(renderJobs.format, "16x9"));
    await t.db.update(renderJobs).set({ status: "done" }).where(eq(renderJobs.format, "9x16"));
    expect(await claimNextRenderJob(t.db, NOW)).toBeNull();
    const [job] = await t.db.select().from(renderJobs).where(eq(renderJobs.format, "16x9"));
    expect(job.status).toBe("failed");
  });

  it("completes into the private bucket, serves only the owner, and expires outputs", async () => {
    const { bucket, objects } = memoryBucket();
    const [job] = await t.db.select().from(renderJobs).where(eq(renderJobs.format, "16x9"));
    const requeued = await requestRender(t.db, { userId: "u1", year: 2026, format: "16x9", now: NOW });
    expect(requeued).toMatchObject({ created: true, job: { id: job.id, status: "queued", attempts: 0 } });
    const claim = await claimNextRenderJob(t.db, NOW);
    expect(claim?.job.id).toBe(job.id);
    const done = await completeRenderJob(t.db, bucket, { id: job.id, lease: claim!.lease, video: bytes(100), poster: bytes(10), now: NOW });
    expect(done).toMatchObject({ status: "done", outputKey: `renders/u1/2026/${job.id}.mp4` });
    expect(done.expiresAt?.getTime()).toBe(NOW.getTime() + OUTPUT_RETENTION_DAYS * DAY);
    expect(objects.size).toBe(2);

    const download = await getRenderDownload(t.db, bucket, { userId: "u1", year: 2026, jobId: job.id, part: "video", now: NOW });
    expect(download).toMatchObject({ size: 100, contentType: "video/mp4", filename: "nlb-year-2026-16x9.mp4" });
    await expect(getRenderDownload(t.db, bucket, { userId: "u2", year: 2026, jobId: job.id, part: "video", now: NOW })).rejects.toMatchObject({ status: 404 });

    const later = new Date(NOW.getTime() + (OUTPUT_RETENTION_DAYS + 1) * DAY);
    expect(await expireRenderJobs(t.db, null, later)).toBe(0); // never drop the pointer while objects cannot be deleted
    expect(await expireRenderJobs(t.db, bucket, later)).toBeGreaterThanOrEqual(1);
    expect(objects.size).toBe(0);
    await expect(getRenderDownload(t.db, bucket, { userId: "u1", year: 2026, jobId: job.id, part: "video", now: later })).rejects.toMatchObject({ status: 404 });
    const [expired] = await t.db.select().from(renderJobs).where(eq(renderJobs.id, job.id));
    expect(expired).toMatchObject({ status: "expired", outputKey: null });
  });

  it("rejects an empty video", async () => {
    const { bucket } = memoryBucket();
    await t.db.update(renderJobs).set({ status: "queued", attempts: 0, lockedUntil: null }).where(eq(renderJobs.format, "9x16"));
    const claim = await claimNextRenderJob(t.db, NOW);
    await expect(completeRenderJob(t.db, bucket, { id: claim!.job.id, lease: claim!.lease, video: bytes(0), now: NOW })).rejects.toMatchObject({ status: 413 });
  });
});
