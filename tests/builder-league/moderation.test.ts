import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { and, eq } from "drizzle-orm";
import { runWithDb } from "@/lib/db";
import { activityEvidence, builderEvents, builderModerationActions, builderPilotMembers, scoreLedger } from "@/lib/db/schema";
import { submitEvidence, type SubmitEvidenceInput } from "@/lib/builder-league/evidence";
import { approveEvidence, decideEvidence, getModerationSummary, listModerationQueue, reverseLedgerEntry } from "@/lib/builder-league/moderation";
import { createAppeal, resolveAppeal } from "@/lib/builder-league/appeals";
import { GET as queueRoute } from "@/app/api/v1/builder-admin/queue/route";
import { POST as decisionRoute } from "@/app/api/v1/builder-admin/evidence/[id]/decision/route";
import { POST as resolveAppealRoute } from "@/app/api/v1/builder-admin/evidence/[id]/appeal/route";
import { POST as reverseRoute } from "@/app/api/v1/builder-admin/ledger/[entryId]/reverse/route";
import { GET as pilotListRoute, POST as pilotRoute } from "@/app/api/v1/builder-admin/pilot/route";
import { POST as appealRoute } from "@/app/api/v1/builder-evidence/[id]/appeal/route";
import { TEST_NOW, V2_WEEK, createLeagueEnv, formRequest, hoursAfter, jsonRequest, seedMembers, type LeagueEnv } from "./evidence-fixtures";

let env: LeagueEnv;
const ADMIN = { actorId: "admin", actorRole: "admin" as const };
const MOD2 = { actorId: "mod2", actorRole: "admin" as const };

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
  await env.reset();
  await seedMembers(env.db);
});

const call = <T>(fn: () => Promise<T>) => runWithDb(env.db, fn);
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });
/** Moves the frozen clock forward, as a real moderator and member act minutes apart. */
const later = (minutes = 5) => vi.setSystemTime(new Date(Date.now() + minutes * 60_000));

async function submitPost(userId = "alice", overrides: Partial<SubmitEvidenceInput> = {}) {
  const { evidence } = await submitEvidence(
    env.db,
    { userId, actorRole: userId === "admin" ? "admin" : "member" },
    {
      eventType: "ship_public_post",
      projectId: `p-${userId}`,
      title: "Launch thread on X",
      summary: "Posted the launch thread.",
      occurredAt: hoursAfter(V2_WEEK, 2).toISOString(),
      links: ["https://x.com/status/1"],
      ...overrides,
    }
  );
  return evidence;
}

const auditFor = (targetId: string) => env.db.select().from(builderModerationActions).where(eq(builderModerationActions.targetId, targetId));
const ledgerFor = (userId: string) => env.db.select().from(scoreLedger).where(eq(scoreLedger.userId, userId));

describe("approval", () => {
  it("records a moderator-verified event, awards RP once and audits the decision", async () => {
    const evidence = await submitPost();
    later();
    const outcome = await decideEvidence(env.db, evidence.id, { decision: "approve", reasonCodes: ["verified_link"], note: "Thread is live" }, ADMIN);
    expect(outcome).toMatchObject({ decision: "approve", decided: true, evidence: { status: "approved", decidedBy: "admin" } });
    if (outcome.decision !== "approve") throw new Error("unreachable");
    expect(outcome.event).toMatchObject({
      kind: "activity",
      source: "moderator",
      externalEventId: `evidence:${evidence.id}`,
      verification: "moderator_verified",
      evidenceId: evidence.id,
      rulesetVersion: "v2",
      actorUserId: "admin",
    });
    expect(outcome.award).toMatchObject({ created: true, entry: { rp: 10, stage: "ship", userId: "alice" } });
    const [stored] = await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, evidence.id));
    expect(stored.eventId).toBe(outcome.event.id);
    const audit = await auditFor(evidence.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "approve", actorId: "admin", actorRole: "admin", reasonCodes: ["verified_link"], notes: "Thread is live" });

    // Approving again (a double click) replays the same award instead of failing or double counting.
    const again = await decideEvidence(env.db, evidence.id, { decision: "approve" }, MOD2);
    expect(again).toMatchObject({ decided: false, evidence: { decidedBy: "admin" } });
    expect(await ledgerFor("alice")).toHaveLength(1);
    expect(await auditFor(evidence.id)).toHaveLength(1);
  });

  it("awards exactly once under concurrent approvals from two moderators", async () => {
    const evidence = await submitPost();
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, index) => decideEvidence(env.db, evidence.id, { decision: "approve" }, index % 2 ? MOD2 : ADMIN))
    );
    expect(outcomes.filter((outcome) => outcome.decided)).toHaveLength(1);
    const entryIds = new Set(outcomes.map((outcome) => (outcome.decision === "approve" ? outcome.award.entry?.id : null)));
    expect(entryIds.size).toBe(1);
    expect(await ledgerFor("alice")).toHaveLength(1);
    expect(await env.db.select().from(builderEvents).where(eq(builderEvents.kind, "activity"))).toHaveLength(1);
    expect((await auditFor(evidence.id)).filter((row) => row.action === "approve")).toHaveLength(1);
  });

  it("finishes an approval whose award step failed before it could record the event", async () => {
    const evidence = await submitPost();
    // Simulate a crash between claiming the evidence and recording the event.
    await env.db.update(activityEvidence).set({ status: "approved", decidedBy: "admin", decidedAt: new Date() }).where(eq(activityEvidence.id, evidence.id));
    const replay = await approveEvidence(env.db, evidence.id, MOD2, { fromStatuses: ["submitted"], reasonCodes: ["meets_requirements"], note: null });
    expect(replay).toMatchObject({ decided: false, event: { actorUserId: "admin", verification: "moderator_verified" }, award: { created: true } });
    expect(await ledgerFor("alice")).toHaveLength(1);
  });

  it("never lets anyone approve their own evidence, nor API keys, agents or members approve at all", async () => {
    const own = await submitPost("admin");
    await expect(decideEvidence(env.db, own.id, { decision: "approve" }, ADMIN)).rejects.toMatchObject({ status: 403, code: "self_moderation" });
    await expect(decideEvidence(env.db, own.id, { decision: "reject", reasonCodes: ["spam"] }, ADMIN)).rejects.toMatchObject({ code: "self_moderation" });
    const viaRoute = await call(() => decisionRoute(jsonRequest(`/x`, "admin", { decision: "approve" }), params({ id: own.id })));
    expect(viaRoute.status).toBe(403);
    expect((await decideEvidence(env.db, own.id, { decision: "approve" }, MOD2)).evidence.status).toBe("approved");

    const evidence = await submitPost();
    for (const actorRole of ["api", "agent", "member", "system"] as const) {
      await expect(decideEvidence(env.db, evidence.id, { decision: "approve" }, { actorId: "admin", actorRole })).rejects.toMatchObject({ status: 403 });
    }
    for (const auth of ["api_key", "delegation"]) {
      const response = await call(() => decisionRoute(jsonRequest("/x", "admin", { decision: "approve" }, { auth }), params({ id: evidence.id })));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "session_required" } });
    }
    // A member is not told the admin route exists while the league is hidden, and is refused once it is public.
    expect((await call(() => decisionRoute(jsonRequest("/x", "bob", { decision: "approve" }), params({ id: evidence.id })))).status).toBe(404);
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    expect((await call(() => decisionRoute(jsonRequest("/x", "bob", { decision: "approve" }), params({ id: evidence.id })))).status).toBe(403);
    expect((await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, evidence.id)))[0].status).toBe("submitted");
    expect(await ledgerFor("alice")).toHaveLength(0);
  });
});

describe("reject and needs_info", () => {
  it("requires reason codes, stores them for the member and blocks a later approval", async () => {
    const evidence = await submitPost();
    await expect(decideEvidence(env.db, evidence.id, { decision: "reject" }, ADMIN)).rejects.toMatchObject({ name: "ZodError" });
    await expect(decideEvidence(env.db, evidence.id, { decision: "reject", reasonCodes: ["other"] }, ADMIN)).rejects.toMatchObject({ name: "ZodError" });
    await expect(decideEvidence(env.db, evidence.id, { decision: "reject", reasonCodes: ["made_up"] }, ADMIN)).rejects.toMatchObject({ name: "ZodError" });

    const response = await call(() =>
      decisionRoute(jsonRequest("/x", "admin", { decision: "reject", reasonCodes: ["duplicate"], note: "Same thread as last week" }), params({ id: evidence.id }))
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ decision: "reject", decided: true, award: null });
    expect(body.data.evidence.decision).toMatchObject({ reasonCodes: ["duplicate"], note: "Same thread as last week" });

    await expect(decideEvidence(env.db, evidence.id, { decision: "approve" }, MOD2)).rejects.toMatchObject({ status: 409, code: "already_decided" });
    expect(await ledgerFor("alice")).toHaveLength(0);
    expect((await auditFor(evidence.id)).map((row) => row.action)).toEqual(["reject"]);
  });

  it("works from a plain HTML form and redirects back to the queue", async () => {
    const evidence = await submitPost();
    const form = new FormData();
    form.set("decision", "needs_info");
    form.append("reasonCodes", "missing_link");
    form.append("reasonCodes", "unclear_outcome");
    form.set("returnTo", "/vi/studio/builder-league/moderation?stage=ship");
    const response = await call(() => decisionRoute(formRequest(`/api/v1/builder-admin/evidence/${evidence.id}/decision`, "admin", form), params({ id: evidence.id })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://nlb.test/vi/studio/builder-league/moderation?stage=ship&notice=info_requested");
    expect((await auditFor(evidence.id))[0]).toMatchObject({ action: "request_info", reasonCodes: ["missing_link", "unclear_outcome"] });
  });
});

describe("reversal", () => {
  it("lets an admin reverse an award with a negative, audited, idempotent entry", async () => {
    const evidence = await submitPost();
    const outcome = await decideEvidence(env.db, evidence.id, { decision: "approve" }, ADMIN);
    if (outcome.decision !== "approve" || !outcome.award.entry) throw new Error("expected an award");
    const entryId = outcome.award.entry.id;

    await expect(reverseLedgerEntry(env.db, entryId, { reason: "x" }, ADMIN)).rejects.toMatchObject({ name: "ZodError" });
    await expect(reverseLedgerEntry(env.db, entryId, { reason: "Post was deleted" }, { actorId: "alice", actorRole: "member" })).rejects.toMatchObject({ status: 403 });
    const api = await call(() => reverseRoute(jsonRequest("/x", "admin", { reason: "Post was deleted" }, { auth: "api_key" }), params({ entryId })));
    expect(api.status).toBe(403);

    const response = await call(() => reverseRoute(jsonRequest("/x", "admin", { reason: "Post was deleted" }), params({ entryId })));
    expect(response.status).toBe(200);
    const reversal = (await response.json()).data;
    expect(reversal).toMatchObject({ rp: -10, reversesEntryId: entryId, reason: "Post was deleted" });
    const again = await reverseLedgerEntry(env.db, entryId, { reason: "Post was deleted" }, MOD2);
    expect(again.id).toBe(reversal.id);

    const entries = await ledgerFor("alice");
    expect(entries).toHaveLength(2);
    expect(entries.reduce((sum, entry) => sum + entry.rp, 0)).toBe(0);
    const audit = await env.db.select().from(builderModerationActions).where(eq(builderModerationActions.action, "reverse"));
    expect(audit).toHaveLength(1);
  });
});

describe("appeals", () => {
  async function rejected(userId = "alice") {
    const evidence = await submitPost(userId);
    later();
    await decideEvidence(env.db, evidence.id, { decision: "reject", reasonCodes: ["insufficient_evidence"] }, userId === "admin" ? MOD2 : ADMIN);
    later();
    return evidence;
  }
  const appealReason = { reason: "The thread is public; the link was mistyped and is now fixed." };

  it("allows one open appeal per rejection and lets an admin uphold it", async () => {
    const approved = await submitPost();
    await decideEvidence(env.db, approved.id, { decision: "approve" }, ADMIN);
    await expect(createAppeal(env.db, "alice", approved.id, appealReason)).rejects.toMatchObject({ status: 409, code: "not_appealable" });

    const evidence = await rejected();
    await expect(createAppeal(env.db, "bob", evidence.id, appealReason)).rejects.toMatchObject({ status: 404 });
    await expect(createAppeal(env.db, "alice", evidence.id, { reason: "too short" })).rejects.toMatchObject({ name: "ZodError" });
    const response = await call(() => appealRoute(jsonRequest("/x", "alice", appealReason), params({ id: evidence.id })));
    expect(response.status).toBe(201);
    const concurrent = await Promise.allSettled([createAppeal(env.db, "alice", evidence.id, appealReason), createAppeal(env.db, "alice", evidence.id, appealReason)]);
    expect(concurrent.every((result) => result.status === "rejected")).toBe(true);
    await expect(createAppeal(env.db, "alice", evidence.id, appealReason)).rejects.toMatchObject({ code: "appeal_open" });
    expect((await getModerationSummary(env.db)).openAppeals).toBe(1);

    const queue = await call(() => queueRoute(jsonRequest("/api/v1/builder-admin/queue?view=appeals", "admin")));
    expect((await queue.json()).data).toHaveLength(1);

    const upheld = await resolveAppeal(env.db, { evidenceId: evidence.id }, { outcome: "uphold", resolution: "Link still broken" }, MOD2);
    expect(upheld).toMatchObject({ appeal: { status: "upheld", resolvedBy: "mod2" }, approval: null });
    await expect(resolveAppeal(env.db, { evidenceId: evidence.id }, { outcome: "overturn", resolution: "Changed my mind" }, ADMIN)).rejects.toMatchObject({
      status: 409,
      code: "appeal_resolved",
    });
    later();
    await expect(createAppeal(env.db, "alice", evidence.id, appealReason)).rejects.toMatchObject({ code: "appeal_used" });
    expect((await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, evidence.id)))[0].status).toBe("rejected");
    expect((await auditFor(upheld.appeal.id)).map((row) => row.action)).toEqual(["uphold"]);
  });

  it("approves and awards when an appeal is overturned, with an audit trail", async () => {
    const evidence = await rejected();
    const appeal = await createAppeal(env.db, "alice", evidence.id, appealReason);
    const form = new FormData();
    form.set("outcome", "overturn");
    form.set("resolution", "Verified the corrected link.");
    form.set("appealId", appeal.id);
    const response = await call(() => resolveAppealRoute(formRequest("/x", "admin", form), params({ id: evidence.id })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("notice=appeal_overturned");

    const [stored] = await env.db.select().from(activityEvidence).where(eq(activityEvidence.id, evidence.id));
    expect(stored.status).toBe("approved");
    expect(await ledgerFor("alice")).toEqual([expect.objectContaining({ rp: 10 })]);
    expect((await auditFor(appeal.id)).map((row) => row.action)).toEqual(["overturn"]);
    expect((await auditFor(evidence.id)).map((row) => row.action).sort()).toEqual(["approve_on_appeal", "reject"]);

    // A retried overturn completes idempotently.
    const retry = await resolveAppeal(env.db, { evidenceId: evidence.id, appealId: appeal.id }, { outcome: "overturn", resolution: "Retry" }, ADMIN);
    expect(retry.approval).toMatchObject({ decided: false });
    expect(await ledgerFor("alice")).toHaveLength(1);
  });

  it("does not let an admin resolve their own appeal", async () => {
    const evidence = await rejected("admin");
    await createAppeal(env.db, "admin", evidence.id, appealReason);
    await expect(resolveAppeal(env.db, { evidenceId: evidence.id }, { outcome: "overturn", resolution: "Looks fine to me" }, ADMIN)).rejects.toMatchObject({
      status: 403,
      code: "self_moderation",
    });
  });
});

describe("moderation queue and pilot list", () => {
  it("lists open evidence oldest first with filters and keyset pagination", async () => {
    const first = await submitPost();
    later(60 * 30);
    const second = await submitPost("bob");
    later(60);
    const help = await submitEvidence(env.db, { userId: "carol", actorRole: "member" }, {
      eventType: "contribute_peer_help",
      title: "Helped Bob deploy",
      summary: "Spent an hour pairing on the deploy pipeline and fixed the failing migration together.",
      occurredAt: "2026-11-03",
      counterparty: "bob",
    });
    later(5);

    const page1 = await listModerationQueue(env.db, { limit: 2 });
    expect(page1.items.map((item) => item.evidence.id)).toEqual([first.id, second.id]);
    expect(page1.items[0]).toMatchObject({ rulesetVersion: "v2", rp: 10, requiredVerification: "moderator_verified", submitterName: "Alice", projectName: "Alice app" });
    const response = await call(() => queueRoute(jsonRequest(`/api/v1/builder-admin/queue?limit=2&cursor=${page1.nextCursor}`, "admin")));
    const page2 = await response.json();
    expect(page2.data.map((item: { evidence: { id: string } }) => item.evidence.id)).toEqual([help.evidence.id]);
    expect(page2.data[0]).toMatchObject({ awaitingCounterparty: true, requiredVerification: "peer_confirmed" });
    expect(page2.pagination.nextCursor).toBeNull();

    expect((await listModerationQueue(env.db, { stage: "contribute" })).items).toHaveLength(1);
    expect((await listModerationQueue(env.db, { olderThanHours: 24 })).items.map((item) => item.evidence.id)).toEqual([first.id]);
    await decideEvidence(env.db, second.id, { decision: "needs_info", reasonCodes: ["missing_link"] }, ADMIN);
    expect((await listModerationQueue(env.db, { status: "needs_info" })).items.map((item) => item.evidence.id)).toEqual([second.id]);

    expect((await call(() => queueRoute(jsonRequest("/api/v1/builder-admin/queue", "alice")))).status).toBe(404);
    expect((await call(() => queueRoute(jsonRequest("/api/v1/builder-admin/queue?stage=space", "admin")))).status).toBe(400);
  });

  it("adds and removes pilot members by id or email, audited and idempotent", async () => {
    const add = await call(() => pilotRoute(jsonRequest("/x", "admin", { action: "add", email: "OUTSIDER@example.com", note: "Cohort 2" })));
    expect(add.status).toBe(200);
    expect((await add.json()).data).toEqual({ userId: "outsider", action: "add", changed: true });
    const repeat = await call(() => pilotRoute(jsonRequest("/x", "admin", { action: "add", userId: "outsider" })));
    expect((await repeat.json()).data.changed).toBe(false);
    const list = await call(() => pilotListRoute(jsonRequest("/x", "admin")));
    expect((await list.json()).data.map((row: { userId: string }) => row.userId).sort()).toEqual(["alice", "bob", "carol", "outsider"]);

    const missing = await call(() => pilotRoute(jsonRequest("/x", "admin", { action: "add", email: "ghost@example.com" })));
    expect(missing.status).toBe(404);
    const remove = await call(() => pilotRoute(jsonRequest("/x", "admin", { action: "remove", userId: "alice" })));
    expect((await remove.json()).data).toMatchObject({ action: "remove", changed: true });
    expect(await env.db.select().from(builderPilotMembers).where(eq(builderPilotMembers.userId, "alice"))).toHaveLength(0);
    const audit = await env.db
      .select()
      .from(builderModerationActions)
      .where(and(eq(builderModerationActions.targetType, "pilot_member")));
    expect(audit.map((row) => `${row.action}:${row.targetId}`).sort()).toEqual(["add:outsider", "remove:alice"]);
    expect((await call(() => pilotListRoute(jsonRequest("/x", "bob")))).status).toBe(404);
  });
});
