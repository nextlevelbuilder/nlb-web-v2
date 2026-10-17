import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { communityConnections, onboardingJobs } from "@/lib/db/schema";
import { requestMemberReconcile, RETRY_RATE_LIMIT_MS } from "@/lib/onboarding/status";
import { createMember, createTestUser, nextId, sessionFor, type TestUser } from "./helpers/onboarding-fixtures";

const getSessionMock = vi.fn();
const applyMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: (...args: unknown[]) => getSessionMock(...args) } }),
}));

vi.mock("@/lib/community/registry", () => ({
  getCommunityAdapter: () => ({ apply: (...args: unknown[]) => applyMock(...args) }),
}));

async function postRetry(body: unknown) {
  const { POST } = await import("@/app/api/onboarding/retry/route");
  return POST(
    new Request("https://nextlevelbuilder.io/api/onboarding/retry", { method: "POST", body: JSON.stringify(body) })
  );
}

async function deleteConnection(provider: string) {
  const { DELETE } = await import("@/app/api/onboarding/connections/[provider]/route");
  return DELETE(new Request(`https://nextlevelbuilder.io/api/onboarding/connections/${provider}`, { method: "DELETE" }), {
    params: Promise.resolve({ provider }),
  });
}

async function linkDiscord(user: TestUser) {
  await getDb()
    .insert(communityConnections)
    .values({ userId: user.id, provider: "discord", externalUserId: nextId("discord"), displayName: "member#1" });
}

async function discordRows(user: TestUser) {
  return getDb()
    .select()
    .from(communityConnections)
    .where(and(eq(communityConnections.userId, user.id), eq(communityConnections.provider, "discord")));
}

let user: TestUser;

beforeEach(async () => {
  vi.stubEnv("ONBOARDING_V2_ENABLED", "true");
  getSessionMock.mockReset();
  applyMock.mockReset();
  user = await createTestUser();
  await createMember(user);
  getSessionMock.mockResolvedValue(sessionFor(user));
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/onboarding/retry", () => {
  it("requires a session and a known target", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    expect((await postRetry({ target: "discord_guild" })).status).toBe(401);
    expect((await postRetry({ target: "slack" })).status).toBe(400);
  });

  it("queues a reconcile, then limits the member to one request per 30 seconds across targets", async () => {
    const first = await postRetry({ target: "discord_guild" });
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ queued: true });

    const second = await postRetry({ target: "telegram_group" });
    expect(second.status).toBe(429);
    expect(Number(second.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await second.json()).error).toBe("rate_limited");

    const [job] = await getDb()
      .select()
      .from(onboardingJobs)
      .where(eq(onboardingJobs.dedupeKey, `reconcile_access:${user.id}:discord_guild`));
    expect(job.payload).toMatchObject({ userId: user.id, target: "discord_guild" });
  });

  it("allows another request once the window has passed and keeps users independent", async () => {
    const start = new Date("2026-10-17T07:00:00Z");
    expect(await requestMemberReconcile(getDb(), user.id, "discord_guild", start)).toEqual({ ok: true });
    const blocked = await requestMemberReconcile(getDb(), user.id, "discord_guild", new Date(start.getTime() + 10_000));
    expect(blocked).toEqual({ ok: false, retryAfterMs: 20_000 });

    const other = await createTestUser();
    expect(await requestMemberReconcile(getDb(), other.id, "discord_guild", new Date(start.getTime() + 10_000))).toEqual({ ok: true });
    expect(
      await requestMemberReconcile(getDb(), user.id, "discord_guild", new Date(start.getTime() + RETRY_RATE_LIMIT_MS + 1))
    ).toEqual({ ok: true });
  });
});

describe("DELETE /api/onboarding/connections/:provider", () => {
  it("rejects anonymous, unknown and unlinked requests", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    expect((await deleteConnection("discord")).status).toBe(401);
    expect((await deleteConnection("slack")).status).toBe(404);
    const notLinked = await deleteConnection("discord");
    expect(notLinked.status).toBe(404);
    expect(await notLinked.json()).toEqual({ error: "not_linked" });
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("revokes access before deleting the link, then queues a reconcile", async () => {
    await linkDiscord(user);
    applyMock.mockImplementation(async () => {
      // The row must still exist while the adapter revokes.
      expect(await discordRows(user)).toHaveLength(1);
      return { appliedTier: "none", status: "revoked", retryable: false };
    });

    const response = await deleteConnection("discord");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unlinked: true });
    expect(applyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, target: "discord_guild", desiredTier: "none" })
    );
    expect(await discordRows(user)).toHaveLength(0);
    const [job] = await getDb()
      .select()
      .from(onboardingJobs)
      .where(eq(onboardingJobs.dedupeKey, `reconcile_access:${user.id}:discord_guild`));
    expect(job?.status).toBe("pending");
  });

  it("keeps the link when the revoke fails or is only partly applied", async () => {
    await linkDiscord(user);
    applyMock.mockRejectedValueOnce(new Error("discord down"));
    expect((await deleteConnection("discord")).status).toBe(502);
    applyMock.mockResolvedValueOnce({ appliedTier: "premium", status: "retrying", retryable: true });
    expect((await deleteConnection("discord")).status).toBe(502);
    expect(await discordRows(user)).toHaveLength(1);
  });
});
