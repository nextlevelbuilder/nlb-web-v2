import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const discord = vi.hoisted(() => ({ sharedIdentity: false }));

vi.mock("@/lib/auth-api-key", () => ({
  resolveCaller: async (headers: Headers) => {
    const id = headers.get("x-test-user");
    if (!id) return null;
    const role = id === "admin" || id === "mod2" ? "admin" : "user";
    return { user: { id, name: id, email: `${id}@example.com`, role, emailVerified: true }, authType: headers.get("x-test-auth") ?? "session" };
  },
}));
vi.mock("@/lib/polar", () => ({
  MEMBERSHIP_PLAN_PRODUCT_IDS: { premium: ["prod_premium"], vip: ["prod_vip"] },
  EARLYBIRD_MEMBERSHIP_PRODUCT_IDS: { premium: undefined, vip: undefined },
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      BUILDER_EVIDENCE: (globalThis as { __BUILDER_EVIDENCE__?: unknown }).__BUILDER_EVIDENCE__,
      BUILDER_LEAGUE_ENABLED: process.env.BUILDER_LEAGUE_ENABLED,
    },
  }),
}));
// `community_connections` is unique on (provider, external id), so two accounts cannot hold the same
// Discord identity in today's schema; the check is exercised by making the lookup report a shared one.
vi.mock("@/lib/builder-league/membership", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/builder-league/membership")>();
  return {
    ...original,
    getDiscordIdentity: async (...args: Parameters<typeof original.getDiscordIdentity>) =>
      discord.sharedIdentity ? { externalUserId: "discord-123", username: "same", linkedAt: new Date() } : original.getDiscordIdentity(...args),
  };
});

import { eq } from "drizzle-orm";
import { runWithDb } from "@/lib/db";
import { activityEvidence, builderEvents, builderModerationActions, communityConnections, scoreLedger } from "@/lib/db/schema";
import { submitEvidence } from "@/lib/builder-league/evidence";
import { decideEvidence } from "@/lib/builder-league/moderation";
import { confirmPeerHelp, sharesDiscordIdentity } from "@/lib/builder-league/peer-help";
import { getRuleset } from "@/lib/builder-league/ruleset";
import { POST as confirmRoute } from "@/app/api/v1/builder-evidence/[id]/confirm/route";
import { TEST_NOW, createLeagueEnv, formRequest, jsonRequest, longText, seedMembers, type LeagueEnv } from "./evidence-fixtures";

let env: LeagueEnv;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: TEST_NOW });
  env = await createLeagueEnv();
});
afterAll(async () => {
  await env.dispose();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.setSystemTime(TEST_NOW);
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
  discord.sharedIdentity = false;
  await env.reset();
  await seedMembers(env.db);
});

const call = <T>(fn: () => Promise<T>) => runWithDb(env.db, fn);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const member = (userId: string) => ({ userId, actorRole: "member" as const });

async function helped(helper: string, counterparty: string, occurredAt = "2026-11-03") {
  const { evidence } = await submitEvidence(env.db, member(helper), {
    eventType: "contribute_peer_help",
    title: `Helped ${counterparty}`,
    summary: longText(100),
    occurredAt,
    counterparty,
  });
  return evidence;
}

const ledgerFor = (userId: string) => env.db.select().from(scoreLedger).where(eq(scoreLedger.userId, userId));

describe("counterparty confirmation", () => {
  it("lets the helped member confirm, which verifies and awards peer help without a moderator", async () => {
    const evidence = await helped("alice", "bob");
    await expect(decideEvidence(env.db, evidence.id, { decision: "approve" }, { actorId: "admin", actorRole: "admin" })).rejects.toMatchObject({
      status: 409,
      code: "counterparty_unconfirmed",
    });

    const response = await call(() => confirmRoute(jsonRequest(`/api/v1/builder-evidence/${evidence.id}/confirm`, "bob", {}), params(evidence.id)));
    expect(response.status).toBe(200);
    const body = (await response.json()).data;
    expect(body).toMatchObject({ confirmed: true, requiresModerator: false, award: { rp: 8 }, evidence: { status: "approved" } });

    const [event] = await env.db.select().from(builderEvents);
    expect(event).toMatchObject({ source: "system", verification: "peer_confirmed", actorRole: "system", subjectUserId: "alice", evidenceId: evidence.id });
    expect(await ledgerFor("alice")).toEqual([expect.objectContaining({ rp: 8 })]);
    expect(await ledgerFor("bob")).toHaveLength(0);
    const audit = await env.db.select().from(builderModerationActions).where(eq(builderModerationActions.targetId, evidence.id));
    expect(audit.map((row) => `${row.action}:${row.actorId}`).sort()).toEqual(["approve:system", "confirm:bob"]);

    // A second click is a harmless replay.
    const again = await confirmPeerHelp(env.db, evidence.id, member("bob"));
    expect(again).toMatchObject({ confirmed: false, approval: { decided: false } });
    expect(await ledgerFor("alice")).toHaveLength(1);
  });

  it("awards once when the confirmation is sent twice at the same time", async () => {
    const evidence = await helped("alice", "bob");
    const outcomes = await Promise.all([confirmPeerHelp(env.db, evidence.id, member("bob")), confirmPeerHelp(env.db, evidence.id, member("bob"))]);
    expect(outcomes.filter((outcome) => outcome.confirmed)).toHaveLength(1);
    expect(await ledgerFor("alice")).toHaveLength(1);
  });

  it("works from a plain HTML form", async () => {
    const evidence = await helped("alice", "bob");
    const form = new FormData();
    form.set("returnTo", `/builder-league/evidence/${evidence.id}`);
    const response = await call(() => confirmRoute(formRequest("/x", "bob", form), params(evidence.id)));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://nlb.test/builder-league/evidence/${evidence.id}?notice=confirmed`);
  });

  it("refuses self-confirmation, strangers, API keys and agents", async () => {
    const evidence = await helped("alice", "bob");
    for (const user of ["alice", "carol", "admin"]) {
      expect((await call(() => confirmRoute(jsonRequest("/x", user, {}), params(evidence.id)))).status).toBe(404);
    }
    for (const auth of ["api_key", "delegation"]) {
      const response = await call(() => confirmRoute(jsonRequest("/x", "bob", {}, { auth }), params(evidence.id)));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "confirmation_requires_session" } });
    }
    // Evidence naming its own author (never accepted at submit) still cannot be self-confirmed.
    await env.db.update(activityEvidence).set({ counterpartyUserId: "alice" }).where(eq(activityEvidence.id, evidence.id));
    await expect(confirmPeerHelp(env.db, evidence.id, member("alice"))).rejects.toMatchObject({ status: 403, code: "self_confirmation" });
    expect(await ledgerFor("alice")).toHaveLength(0);
  });

  it("refuses accounts that share a Discord identity", async () => {
    await env.db.insert(communityConnections).values([
      { userId: "alice", provider: "discord", externalUserId: "discord-a", displayName: "alice" },
      { userId: "bob", provider: "discord", externalUserId: "discord-b", displayName: "bob" },
    ]);
    expect(await sharesDiscordIdentity(env.db, "alice", "bob")).toBe(false);
    const evidence = await helped("alice", "bob");
    discord.sharedIdentity = true;
    await expect(confirmPeerHelp(env.db, evidence.id, member("bob"))).rejects.toMatchObject({ status: 403, code: "same_discord_identity" });
    const [stored] = await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, evidence.id));
    expect(stored.counterpartyConfirmedAt).toBeNull();
  });

  it("caps circular help between the same two members per ruleset window", async () => {
    const first = await helped("alice", "bob", "2026-11-03");
    await confirmPeerHelp(env.db, first.id, member("bob"));
    // Bob returns the favour in the same week: the pair cap (1 per counterparty per week) is spent.
    const back = await helped("bob", "alice", "2026-11-04");
    await expect(confirmPeerHelp(env.db, back.id, member("alice"))).rejects.toMatchObject({ status: 409, code: "circular_confirmation_cap" });
    const again = await helped("alice", "bob", "2026-11-05");
    await expect(confirmPeerHelp(env.db, again.id, member("bob"))).rejects.toMatchObject({ code: "circular_confirmation_cap" });
    // Other pairs and the next week are unaffected.
    const carol = await helped("carol", "alice", "2026-11-04");
    expect((await confirmPeerHelp(env.db, carol.id, member("alice"))).confirmed).toBe(true);
    const nextWeek = await helped("bob", "alice", "2026-11-10");
    expect((await confirmPeerHelp(env.db, nextWeek.id, member("alice"))).confirmed).toBe(true);
    expect(await ledgerFor("bob")).toHaveLength(1);
  });

  it("keeps confirmed help in the moderator queue when the ruleset requires a moderator", async () => {
    const definition = getRuleset("v2").events.contribute_peer_help!;
    const original = definition.requiredVerification;
    definition.requiredVerification = "moderator_verified";
    try {
      const evidence = await helped("alice", "bob");
      const outcome = await confirmPeerHelp(env.db, evidence.id, member("bob"));
      expect(outcome).toMatchObject({ confirmed: true, requiresModerator: true, approval: null, evidence: { status: "submitted" } });
      expect(await ledgerFor("alice")).toHaveLength(0);
      const approved = await decideEvidence(env.db, evidence.id, { decision: "approve" }, { actorId: "admin", actorRole: "admin" });
      expect(approved).toMatchObject({ evidence: { status: "approved" }, event: { verification: "moderator_verified", source: "moderator" } });
      expect(await ledgerFor("alice")).toHaveLength(1);
    } finally {
      definition.requiredVerification = original;
    }
  });

  it("refuses confirmation for event types that do not need one, and for closed evidence", async () => {
    const { evidence: post } = await submitEvidence(env.db, member("alice"), {
      eventType: "ship_public_post",
      projectId: "p-alice",
      title: "Launch post",
      occurredAt: "2026-11-03",
      links: ["https://x.com/status/1"],
    });
    await env.db.update(activityEvidence).set({ counterpartyUserId: "bob" }).where(eq(activityEvidence.id, post.id));
    await expect(confirmPeerHelp(env.db, post.id, member("bob"))).rejects.toMatchObject({ code: "not_confirmable" });

    const evidence = await helped("alice", "bob");
    await decideEvidence(env.db, evidence.id, { decision: "reject", reasonCodes: ["spam"] }, { actorId: "admin", actorRole: "admin" });
    await expect(confirmPeerHelp(env.db, evidence.id, member("bob"))).rejects.toMatchObject({ status: 409, code: "evidence_locked" });
  });
});
