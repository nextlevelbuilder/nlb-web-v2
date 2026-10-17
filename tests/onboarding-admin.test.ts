import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { onboardingJobs } from "@/lib/db/schema";
import { createTestUser, nextId, sessionFor } from "./helpers/onboarding-fixtures";

const getSessionMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: (...args: unknown[]) => getSessionMock(...args) } }),
}));

const url = "https://nextlevelbuilder.io/api/admin/onboarding/jobs";

async function getJobs() {
  const { GET } = await import("@/app/api/admin/onboarding/jobs/route");
  return GET(new Request(url));
}

async function retry(body: unknown) {
  const { POST } = await import("@/app/api/admin/onboarding/jobs/route");
  return POST(new Request(url, { method: "POST", body: JSON.stringify(body) }));
}

async function insertJob(status: "dead" | "pending", lastError: string | null) {
  const [job] = await getDb()
    .insert(onboardingJobs)
    .values({
      kind: "reconcile_access",
      dedupeKey: nextId("admin-test"),
      payload: { userId: "secret-user-id", target: "discord_guild", email: "member@example.com" },
      status,
      attempts: status === "dead" ? 8 : 1,
      lastError,
    })
    .returning();
  return job;
}

beforeEach(() => getSessionMock.mockReset());

describe("admin onboarding jobs", () => {
  it("requires a session and the admin role", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await getJobs()).status).toBe(401);
    expect((await retry({ id: "x" })).status).toBe(401);

    getSessionMock.mockResolvedValue(sessionFor(await createTestUser()));
    expect((await getJobs()).status).toBe(403);
    expect((await retry({ id: "x" })).status).toBe(403);
  });

  it("lists stats and redacted dead and failed jobs", async () => {
    getSessionMock.mockResolvedValue(sessionFor(await createTestUser({ role: "admin" })));
    const dead = await insertJob("dead", "discord_rate_limited");
    const failed = await insertJob("pending", "telegram_timeout");

    const response = await getJobs();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stats).toBeDefined();
    const deadRow = body.dead.find((job: { id: string }) => job.id === dead.id);
    expect(deadRow).toMatchObject({ kind: "reconcile_access", status: "dead", target: "discord_guild", lastError: "discord_rate_limited" });
    expect(Object.keys(deadRow).sort()).toEqual(["attempts", "id", "kind", "lastError", "nextRunAt", "status", "target", "updatedAt"]);
    expect(body.failed.some((job: { id: string }) => job.id === failed.id)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/secret-user-id|member@example\.com/);
  });

  it("puts a dead job back in the queue and rejects invalid ids", async () => {
    getSessionMock.mockResolvedValue(sessionFor(await createTestUser({ role: "admin" })));
    const dead = await insertJob("dead", "discord_failed");

    expect((await retry({})).status).toBe(400);
    const response = await retry({ id: dead.id });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ retried: true });
    const [row] = await getDb().select().from(onboardingJobs).where(eq(onboardingJobs.id, dead.id));
    expect(row.status).toBe("pending");
    expect((await retry({ id: "missing-job" })).status).toBe(409);
  });
});
