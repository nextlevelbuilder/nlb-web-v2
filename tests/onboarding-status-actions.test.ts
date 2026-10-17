import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { communityAccessState, communityConnections, onboardingJobs } from "@/lib/db/schema";
import { reconcileCommunityAccess } from "@/lib/community/reconcile";
import { getOnboardingStatus, requestMemberReconcile, RETRY_RATE_LIMIT_MS } from "@/lib/onboarding/status";
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

  it("marks the unlink and queues it on the reconcile key without calling the provider inline", async () => {
    await linkDiscord(user);
    const response = await deleteConnection("discord");
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ unlinking: true });
    expect(applyMock).not.toHaveBeenCalled();

    const [row] = await discordRows(user);
    expect(row.unlinkRequestedAt).toBeInstanceOf(Date);
    const [job] = await getDb()
      .select()
      .from(onboardingJobs)
      .where(eq(onboardingJobs.dedupeKey, `reconcile_access:${user.id}:discord_guild`));
    expect(job?.status).toBe("pending");

    const status = await getOnboardingStatus(getDb(), user);
    expect(status.connections.discord).toMatchObject({ status: "processing", nextAction: "none", unlinking: true });
  });

  it("revokes in the reconcile job before deleting the link", async () => {
    await linkDiscord(user);
    await deleteConnection("discord");
    applyMock.mockImplementation(async () => {
      // The row must still exist while the adapter revokes.
      expect(await discordRows(user)).toHaveLength(1);
      return { appliedTier: "none", status: "revoked" };
    });

    expect(await reconcileCommunityAccess(getDb(), user.id, "discord_guild")).toMatchObject({ status: "not_connected" });
    expect(applyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, target: "discord_guild", desiredTier: "none" })
    );
    expect(await discordRows(user)).toHaveLength(0);
    const status = await getOnboardingStatus(getDb(), user);
    expect(status.connections.discord).toEqual({ status: "not_connected", nextAction: "connect" });
  });

  it("keeps the link and surfaces the code when the provider did not confirm the removal", async () => {
    await linkDiscord(user);
    await deleteConnection("discord");

    applyMock.mockResolvedValueOnce({ appliedTier: "none", status: "action_required", errorCode: "telegram_bot_not_admin" });
    await reconcileCommunityAccess(getDb(), user.id, "discord_guild");
    expect(await discordRows(user)).toHaveLength(1);
    const status = await getOnboardingStatus(getDb(), user);
    expect(status.connections.discord).toMatchObject({
      status: "action_required",
      nextAction: "retry",
      unlinking: true,
      errorCode: "telegram_bot_not_admin",
    });

    applyMock.mockResolvedValueOnce({ appliedTier: "premium", status: "retrying", retryable: true, errorCode: "discord_http_502" });
    await expect(reconcileCommunityAccess(getDb(), user.id, "discord_guild")).rejects.toMatchObject({ retryable: true });
    applyMock.mockRejectedValueOnce(new Error("discord down"));
    await expect(reconcileCommunityAccess(getDb(), user.id, "discord_guild")).rejects.toMatchObject({ retryable: true });
    expect(await discordRows(user)).toHaveLength(1);

    // A later reconcile, for whatever reason it runs, keeps converging the unlink.
    applyMock.mockResolvedValueOnce({ appliedTier: "none", status: "revoked" });
    await reconcileCommunityAccess(getDb(), user.id, "discord_guild");
    expect(await discordRows(user)).toHaveLength(0);
    const [state] = await getDb()
      .select()
      .from(communityAccessState)
      .where(and(eq(communityAccessState.userId, user.id), eq(communityAccessState.target, "discord_guild")));
    expect(state).toMatchObject({ status: "not_connected", appliedTier: "none", errorCode: null });
  });
});
