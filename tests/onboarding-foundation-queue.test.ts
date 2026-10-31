import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { communityAccessState, onboardingJobs, onboardingNonces, users } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, hashToken, randomToken } from "@/lib/crypto/secret-box";
import { consumeNonce, issueNonce, purgeExpiredNonces } from "@/lib/onboarding/nonces";
import {
  backoffMs,
  claimDueJobs,
  completeJob,
  enqueueAccessReconcile,
  enqueueJob,
  failJob,
  jobStats,
  JOB_MAX_ATTEMPTS,
  listJobs,
  redactError,
  renewJobLease,
  retryJob,
} from "@/lib/onboarding/jobs";
import { runDueJobs, runOnboardingCron, JOB_RUNNER_CRON, MEMBERSHIP_RESYNC_CRON } from "@/lib/onboarding/runner";
import { ProviderError } from "@/lib/community/types";

const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString("base64");
const OTHER_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i)).toString("base64");
const T0 = new Date("2026-10-17T00:00:00Z");
const after = (ms: number) => new Date(T0.getTime() + ms);

let userSeq = 0;
async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const id = `queue-user-${++userSeq}`;
  await getDb().insert(users).values({ id, name: id, email: `${id}@example.com`, emailVerified: true, ...overrides });
  return id;
}

async function jobByKey(dedupeKey: string) {
  const [job] = await getDb().select().from(onboardingJobs).where(eq(onboardingJobs.dedupeKey, dedupeKey));
  return job;
}

beforeEach(async () => {
  vi.stubEnv("ONBOARDING_ENCRYPTION_KEY", KEY);
  await getDb().delete(onboardingJobs);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("secret box", () => {
  it("round-trips with a fresh IV per call and rejects tampering or another key", async () => {
    const a = await encryptSecret("refresh-token-value");
    const b = await encryptSecret("refresh-token-value");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a).not.toContain("refresh-token-value");
    expect(await decryptSecret(a)).toBe("refresh-token-value");

    const [version, iv, data] = a.split(".");
    const flipped = `${version}.${iv}.${data.slice(0, -2)}${data.at(-2) === "A" ? "B" : "A"}${data.slice(-1)}`;
    expect(flipped).not.toBe(a);
    await expect(decryptSecret(flipped)).rejects.toThrow();
    await expect(decryptSecret(a, OTHER_KEY)).rejects.toThrow();
    await expect(decryptSecret("v2.x.y")).rejects.toThrow("Malformed sealed secret");
    await expect(decryptSecret(`${a}.extra`)).rejects.toThrow("Malformed sealed secret");
  });

  it("refuses a missing or wrong-sized key", async () => {
    await expect(encryptSecret("x", "")).rejects.toThrow("not configured");
    await expect(encryptSecret("x", Buffer.from("short").toString("base64"))).rejects.toThrow("32 bytes");
  });

  it("hashes deterministically and generates url-safe random tokens", async () => {
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });
});

describe("onboarding nonces", () => {
  it("stores only the hash and seals the payload", async () => {
    const userId = await createUser();
    const raw = await issueNonce(getDb(), { kind: "discord_oauth", userId, payload: { verifier: "pkce-secret" }, ttlMs: 60_000 }, T0);
    const [row] = await getDb().select().from(onboardingNonces).where(eq(onboardingNonces.nonceHash, await hashToken(raw)));
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain(raw);
    expect(row.payloadEnc).not.toContain("pkce-secret");
    expect(await consumeNonce(getDb(), { kind: "discord_oauth", raw }, after(1000))).toEqual({
      userId,
      payload: { verifier: "pkce-secret" },
    });
  });

  it("is single-use, kind-bound and expires", async () => {
    const userId = await createUser();
    const raw = await issueNonce(getDb(), { kind: "telegram_link", userId, ttlMs: 60_000 }, T0);
    expect(await consumeNonce(getDb(), { kind: "discord_oauth", raw }, after(1))).toBeNull();
    expect(await consumeNonce(getDb(), { kind: "telegram_link", raw }, after(1))).toEqual({ userId, payload: null });
    expect(await consumeNonce(getDb(), { kind: "telegram_link", raw }, after(2))).toBeNull();

    const expiring = await issueNonce(getDb(), { kind: "telegram_link", userId, ttlMs: 60_000 }, T0);
    expect(await consumeNonce(getDb(), { kind: "telegram_link", raw: expiring }, after(60_000))).toBeNull();
    expect(await consumeNonce(getDb(), { kind: "telegram_link", raw: "" }, T0)).toBeNull();
    expect(await consumeNonce(getDb(), { kind: "telegram_link", raw: "never-issued" }, T0)).toBeNull();
  });

  it("lets exactly one of several concurrent consumers win", async () => {
    const userId = await createUser();
    const raw = await issueNonce(getDb(), { kind: "telegram_link", userId, ttlMs: 60_000 }, T0);
    const results = await Promise.all([1, 2, 3, 4].map(() => consumeNonce(getDb(), { kind: "telegram_link", raw }, after(1))));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("purges nonces that expired more than a day ago", async () => {
    const userId = await createUser();
    const old = await issueNonce(getDb(), { kind: "telegram_link", userId, ttlMs: 1000 }, T0);
    const fresh = await issueNonce(getDb(), { kind: "telegram_link", userId, ttlMs: 1000 }, after(24 * 60 * 60 * 1000));
    await purgeExpiredNonces(getDb(), after(24 * 60 * 60 * 1000 + 2000));
    const remaining = await getDb().select({ hash: onboardingNonces.nonceHash }).from(onboardingNonces).where(eq(onboardingNonces.userId, userId));
    expect(remaining.map((r) => r.hash)).toEqual([await hashToken(fresh)]);
    expect(remaining.map((r) => r.hash)).not.toContain(await hashToken(old));
  });
});

describe("onboarding job queue", () => {
  it("backs off 30s doubling per attempt, capped at one hour", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffMs)).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000, 960_000, 1_920_000, 3_600_000,
    ]);
    expect(backoffMs(10)).toBe(3_600_000);
    expect(backoffMs(0)).toBe(30_000);
  });

  it("redacts emails and long tokens from stored errors and keeps provider codes", () => {
    expect(redactError(new ProviderError("discord_403"))).toBe("discord_403");
    const text = redactError(new Error("failed for jane@example.com with token abcdefghijklmnopqrstuvwxyz0123456789"));
    expect(text).not.toContain("jane@example.com");
    expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("dedupes by key: re-enqueue resets to pending, onlyOnce never re-queues", async () => {
    await enqueueAccessReconcile(getDb(), "u-dedupe", undefined, T0);
    await enqueueAccessReconcile(getDb(), "u-dedupe", undefined, T0);
    const rows = await getDb().select().from(onboardingJobs);
    expect(rows.map((r) => r.dedupeKey).sort()).toEqual(["reconcile_access:u-dedupe:discord_guild", "reconcile_access:u-dedupe:telegram_group"]);

    await enqueueJob(getDb(), { kind: "welcome_email", dedupeKey: "welcome_email:sub-1", payload: { v: 1 }, onlyOnce: true }, T0);
    const [claimed] = (await claimDueJobs(getDb(), 10, 60_000, T0)).filter((j) => j.kind === "welcome_email");
    await completeJob(getDb(), claimed, T0);
    await enqueueJob(getDb(), { kind: "welcome_email", dedupeKey: "welcome_email:sub-1", payload: { v: 2 }, onlyOnce: true }, after(1000));
    expect(await jobByKey("welcome_email:sub-1")).toMatchObject({ status: "done", payload: { v: 1 } });
  });

  it("never hands the same job to two concurrent claimers and respects the lease", async () => {
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "lease-1", payload: {} }, T0);
    const results = await Promise.all([1, 2, 3].map(() => claimDueJobs(getDb(), 5, 60_000, T0)));
    expect(results.flat()).toHaveLength(1);
    expect(await claimDueJobs(getDb(), 5, 60_000, after(30_000))).toHaveLength(0);

    // The worker died: once the lease expires another runner reclaims it, and the stale owner's
    // completion is ignored.
    const [stale] = results.flat();
    const [reclaimed] = await claimDueJobs(getDb(), 5, 60_000, after(60_001));
    expect(reclaimed).toMatchObject({ id: stale.id, attempts: 2, status: "running" });
    await completeJob(getDb(), stale, after(60_002));
    expect((await jobByKey("lease-1")).status).toBe("running");
    await completeJob(getDb(), reclaimed, after(60_003));
    expect(await jobByKey("lease-1")).toMatchObject({ status: "done", lockedUntil: null });
  });

  it("does not claim jobs scheduled in the future", async () => {
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "future", payload: {}, runAt: after(10_000) }, T0);
    expect(await claimDueJobs(getDb(), 5, 60_000, T0)).toHaveLength(0);
    expect(await claimDueJobs(getDb(), 5, 60_000, after(10_000))).toHaveLength(1);
  });

  it("runs a job re-enqueued mid-run again instead of marking it done", async () => {
    await enqueueJob(getDb(), { kind: "reconcile_access", dedupeKey: "rerun", payload: { n: 1 } }, T0);
    const [job] = await claimDueJobs(getDb(), 5, 60_000, T0);
    await enqueueJob(getDb(), { kind: "reconcile_access", dedupeKey: "rerun", payload: { n: 2 } }, after(10));
    await completeJob(getDb(), job, after(20));
    expect(await jobByKey("rerun")).toMatchObject({ status: "pending", lockedUntil: null, payload: { n: 2 } });
    const [again] = await claimDueJobs(getDb(), 5, 60_000, after(30));
    expect(again.payload).toEqual({ n: 2 });
  });

  it("retries with backoff and goes dead after the tenth attempt", async () => {
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "flaky", payload: {} }, T0);
    let now = T0;
    for (let attempt = 1; attempt <= JOB_MAX_ATTEMPTS; attempt++) {
      const [job] = await claimDueJobs(getDb(), 5, 60_000, now);
      expect(job.attempts).toBe(attempt);
      const status = await failJob(getDb(), job, new ProviderError("http_503", { retryable: true }), now);
      expect(status).toBe(attempt < JOB_MAX_ATTEMPTS ? "pending" : "dead");
      if (attempt < JOB_MAX_ATTEMPTS) {
        expect((await jobByKey("flaky")).nextRunAt).toEqual(new Date(now.getTime() + backoffMs(attempt)));
        expect(await claimDueJobs(getDb(), 5, 60_000, new Date(now.getTime() + backoffMs(attempt) - 1))).toHaveLength(0);
      }
      now = new Date(now.getTime() + backoffMs(attempt));
    }
    expect(await jobByKey("flaky")).toMatchObject({ status: "dead", attempts: JOB_MAX_ATTEMPTS, lastError: "http_503" });
    expect(await claimDueJobs(getDb(), 5, 60_000, after(365 * 24 * 60 * 60 * 1000))).toHaveLength(0);
  });

  it("honours a provider retry-after longer than the backoff and kills permanent failures at once", async () => {
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "rate-limited", payload: {} }, T0);
    const [job] = await claimDueJobs(getDb(), 5, 60_000, T0);
    await failJob(getDb(), job, new ProviderError("http_429", { retryable: true, retryAfterMs: 120_000 }), T0);
    expect((await jobByKey("rate-limited")).nextRunAt).toEqual(after(120_000));

    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "permanent", payload: {} }, T0);
    const [permanent] = (await claimDueJobs(getDb(), 5, 60_000, T0)).filter((j) => j.dedupeKey === "permanent");
    expect(await failJob(getDb(), permanent, new ProviderError("missing_permissions"), T0)).toBe("dead");
  });

  it("marks a job dead when it crashed the worker on its last attempt", async () => {
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "crasher", payload: {} }, T0);
    await getDb().update(onboardingJobs).set({ attempts: JOB_MAX_ATTEMPTS }).where(eq(onboardingJobs.dedupeKey, "crasher"));
    expect(await claimDueJobs(getDb(), 5, 60_000, T0)).toHaveLength(0);
    expect(await jobByKey("crasher")).toMatchObject({ status: "dead", lastError: "lease_expired" });
  });

  it("retries a dead job manually and reports stats", async () => {
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "manual", payload: {} }, T0);
    const [job] = await claimDueJobs(getDb(), 5, 60_000, T0);
    expect(await retryJob(getDb(), job.id, T0)).toBe(false); // running jobs are left alone
    await failJob(getDb(), job, new ProviderError("bad_config"), T0);
    await enqueueJob(getDb(), { kind: "reconcile_access", dedupeKey: "pending-1", payload: {}, runAt: after(-5000) }, T0);

    const stats = await jobStats(getDb(), T0);
    expect(stats.byStatus).toEqual({ pending: 1, running: 0, done: 0, dead: 1 });
    expect(stats.byKind.admin_notify.dead).toBe(1);
    expect(stats.oldestDueAt).toEqual(after(-5000));
    expect((await listJobs(getDb(), { status: "dead" })).map((j) => j.id)).toEqual([job.id]);

    expect(await retryJob(getDb(), job.id, after(1))).toBe(true);
    expect(await jobByKey("manual")).toMatchObject({ status: "pending", attempts: 0, lastError: null });
  });
});

describe("onboarding job runner", () => {
  it("reconciles both targets through the adapters and completes the jobs", async () => {
    const userId = await createUser();
    await enqueueAccessReconcile(getDb(), userId, undefined, T0);
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "notify-1", payload: { event: "new_membership" } }, T0);
    expect(await runDueJobs(getDb(), { now: () => T0 })).toEqual({ claimed: 3, done: 3, retried: 0, dead: 0, lost: 0 });
    const states = await getDb().select().from(communityAccessState).where(eq(communityAccessState.userId, userId));
    expect(states.map((s) => [s.target, s.desiredTier, s.status]).sort()).toEqual([
      ["discord_guild", "none", "not_connected"],
      ["telegram_group", "none", "not_connected"],
    ]);
  });

  it("kills jobs with an invalid payload or unknown kind without retrying", async () => {
    await enqueueJob(getDb(), { kind: "reconcile_access", dedupeKey: "bad-target", payload: { userId: "x", target: "slack" } }, T0);
    await enqueueJob(getDb(), { kind: "welcome_email", dedupeKey: "bad-welcome", payload: {} }, T0);
    expect(await runDueJobs(getDb(), { now: () => T0 })).toEqual({ claimed: 2, done: 0, retried: 0, dead: 2, lost: 0 });
  });

  it("posts admin notifications to Lark when configured and retries on server errors", async () => {
    vi.stubEnv("LARK_ADMIN_WEBHOOK_URL", "https://lark.example.test/hook");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 503 }));
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "lark", payload: { event: "new_membership", ref: "sub_1" } }, T0);
    expect(await runDueJobs(getDb(), { now: () => T0 })).toMatchObject({ retried: 1 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      msg_type: "text",
      content: { text: "[NLB onboarding] new_membership sub_1" },
    });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect(await runDueJobs(getDb(), { now: () => after(backoffMs(1)) })).toMatchObject({ done: 1 });
    fetchMock.mockRestore();
  });

  it("renews the lease as each job of a batch starts and skips a job another runner re-took", async () => {
    vi.stubEnv("LARK_ADMIN_WEBHOOK_URL", "https://lark.example.test/hook");
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "batch-1", payload: { event: "first" } }, after(-3));
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "batch-2", payload: { event: "second" } }, after(-2));
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "batch-3", payload: { event: "third" } }, after(-1));
    // The claim happens at T0 with a 1 s lease; the first job starts at 0.9 s.
    let clock = after(900);
    let claimed = false;
    const stolen: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const { text } = (JSON.parse(String(init?.body)) as { content: { text: string } }).content;
      if (text.endsWith("first")) {
        // The first job runs past the batch lease; another runner then takes the second job only.
        clock = after(1500);
        const [taken] = await claimDueJobs(getDb(), 1, 1000, clock);
        stolen.push(taken.dedupeKey);
      }
      return new Response("{}", { status: 200 });
    });

    const now = () => {
      if (claimed) return clock;
      claimed = true;
      return T0;
    };
    const summary = await runDueJobs(getDb(), { leaseMs: 1000, now });
    expect(stolen).toEqual(["batch-2"]);
    expect(summary).toEqual({ claimed: 3, done: 2, retried: 0, dead: 0, lost: 1 });
    expect(await jobByKey("batch-2")).toMatchObject({ status: "running", lockedUntil: after(2500) });
    expect(await jobByKey("batch-3")).toMatchObject({ status: "done" });
    fetchMock.mockRestore();
  });

  it("extends only its own lease", async () => {
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "renew", payload: {} }, T0);
    const [job] = await claimDueJobs(getDb(), 1, 1000, T0);
    const renewed = await renewJobLease(getDb(), job, 1000, after(900));
    expect(renewed?.lockedUntil).toEqual(after(1900));
    expect(await claimDueJobs(getDb(), 1, 1000, after(1500))).toEqual([]);
    expect(await renewJobLease(getDb(), job, 1000, after(1000))).toBeNull();
  });

  it("does nothing on any cron while the flag is off", async () => {
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "flag-off", payload: {} }, T0);
    const polar = vi.fn();
    await runOnboardingCron(getDb(), JOB_RUNNER_CRON, { enabled: false, polar });
    await runOnboardingCron(getDb(), MEMBERSHIP_RESYNC_CRON, { enabled: false, polar });
    expect(polar).not.toHaveBeenCalled();
    expect((await jobByKey("flag-off")).status).toBe("pending");
  });

  it("drains the queue on the minute cron and resyncs only on the hourly cron", async () => {
    await enqueueJob(getDb(), { kind: "admin_notify", dedupeKey: "flag-on", payload: {}, runAt: new Date(Date.now() - 1000) });
    const get = vi.fn();
    const polar = vi.fn(async () => ({ subscriptions: { get } }));
    await runOnboardingCron(getDb(), JOB_RUNNER_CRON, { enabled: true, polar });
    expect(polar).not.toHaveBeenCalled();
    expect((await jobByKey("flag-on")).status).toBe("done");
    await runOnboardingCron(getDb(), MEMBERSHIP_RESYNC_CRON, { enabled: true, polar });
    expect(polar).toHaveBeenCalledTimes(1);
  });
});
