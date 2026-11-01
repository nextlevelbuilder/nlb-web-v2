import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth-api-key", async () => (await import("../live-api/live-api-fixtures")).authApiKeyMock);

// The Worker binds an R2 bucket for private evidence; tests have none, so a privacy delete gets an empty one.
const bucketFake = vi.hoisted(() => ({ put: async () => undefined, delete: vi.fn(async () => undefined) }));
vi.mock("@/lib/builder-league/evidence-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/builder-league/evidence-storage")>()),
  getEvidenceBucket: () => bucketFake,
}));

import { getDb } from "@/lib/db";
import { badgeAwards, builderModerationActions, onboardingJobs, operatorAuditLogs, scoreLedger } from "@/lib/db/schema";
import { claimReward } from "@/lib/builder-league/rewards";
import { GET as listQueue } from "@/app/api/v1/operator/builder-league/queue/route";
import { POST as decideEvidence } from "@/app/api/v1/operator/builder-league/evidence/[id]/decision/route";
import { POST as reverseEntry } from "@/app/api/v1/operator/builder-league/ledger/[entryId]/reverse/route";
import { GET as listClaims } from "@/app/api/v1/operator/builder-league/rewards/claims/route";
import { POST as decideClaim } from "@/app/api/v1/operator/builder-league/rewards/claims/[id]/decision/route";
import { GET as listItems, POST as upsertItem } from "@/app/api/v1/operator/builder-league/rewards/items/route";
import { GET as exportData } from "@/app/api/v1/operator/builder-league/privacy/[userId]/export/route";
import { POST as deleteData } from "@/app/api/v1/operator/builder-league/privacy/[userId]/delete/route";
import { POST as reconcile } from "@/app/api/v1/operator/community/reconcile/route";
import { GET as jobHealth } from "@/app/api/v1/operator/system/jobs/route";
import { POST as retryJob } from "@/app/api/v1/operator/system/jobs/[id]/retry/route";
import { asCaller, getRequest, jsonRequest, nextSeq, params, readJson, seedOperator, seedUser, setCaller } from "../live-api/live-api-fixtures";
import { addLedger } from "../builder-league/leaderboards-fixtures";
import { approvedBy, requestVia } from "./operator-api-fixtures";

const auditRows = (actorUserId: string, action: string) =>
  getDb().select().from(operatorAuditLogs).where(and(eq(operatorAuditLogs.actorUserId, actorUserId), eq(operatorAuditLogs.action, action)));

const rewardItem = (key: string) => ({
  key,
  kind: "launch_review",
  title: { en: "Review", vi: "Review" },
  description: { en: "A review", vi: "Một buổi review" },
  eligibility: { period: "season", anyOf: [{ type: "badge", key: "first_builder" }] },
  inventory: null,
  active: true,
});

beforeEach(() => setCaller(null));

describe("Builder League, community and system operators: access", () => {
  it("refuses members, operators of another domain and API keys, and audits each deny", async () => {
    const member = await seedUser("member");
    const systemOperator = await seedOperator(["system:manage"]);
    const keyOperator = await seedOperator(["builder_league:manage"]);
    expect((await listQueue(getRequest("/api/v1/operator/builder-league/queue"))).status).toBe(401);

    const cases: [typeof member, "session" | "api_key", string][] = [
      [member, "session", "not_operator"],
      [systemOperator, "session", "missing_capability"],
      [keyOperator, "api_key", "credential_not_allowed"],
    ];
    for (const [user, authType, code] of cases) {
      setCaller(asCaller(user, authType));
      const response = await reverseEntry(jsonRequest("/api/v1/operator/builder-league/ledger/x/reverse", "POST", { junk: true }), params({ entryId: "x" }));
      expect(response.status).toBe(403);
      expect((await readJson(response)).error?.code).toBe(code);
      expect(await auditRows(user.id, "builder_league.ledger.reverse")).toMatchObject([{ decision: "deny", reason: code, resource: "operator:builder_league" }]);
    }

    // A system operator still cannot reach community, and a league operator cannot reach system.
    setCaller(asCaller(systemOperator, "session"));
    expect((await reconcile(jsonRequest("/api/v1/operator/community/reconcile", "POST", { userId: member.id }))).status).toBe(403);
    setCaller(asCaller(keyOperator, "session"));
    expect((await jobHealth(getRequest("/api/v1/operator/system/jobs"))).status).toBe(403);
  });
});

describe("Builder League operators", () => {
  it("lists the queue and appeals, and decides evidence from a session only", async () => {
    const operator = await seedOperator(["builder_league:manage"]);
    setCaller(asCaller(operator, "session"));
    const queue = await readJson(await listQueue(getRequest("/api/v1/operator/builder-league/queue?status=submitted")));
    expect(Array.isArray(queue.data)).toBe(true);
    expect((queue as { pagination?: unknown }).pagination).toMatchObject({ limit: expect.any(Number) });
    const appeals = await readJson(await listQueue(getRequest("/api/v1/operator/builder-league/queue?view=appeals")));
    expect(Array.isArray(appeals.data)).toBe(true);

    const body = { decision: "approve", reasonCodes: [], note: null };
    expect((await decideEvidence(jsonRequest("/api/v1/operator/builder-league/evidence/missing/decision", "POST", body), params({ id: "missing" }))).status).toBe(404);

    setCaller(asCaller(operator, "api_key"));
    const viaKey = await decideEvidence(jsonRequest("/api/v1/operator/builder-league/evidence/missing/decision", "POST", body), params({ id: "missing" }));
    expect(viaKey.status).toBe(403);
  });

  it("reverses a ledger entry only with an approval bound to the reason, once", async () => {
    const requester = await seedOperator(["builder_league:manage"]);
    const approver = await seedOperator(["builder_league:manage"]);
    const builder = await seedUser("builder");
    const entryId = await addLedger(getDb(), builder.id, { stage: "ship", rp: 40, at: new Date() });
    const reason = "Duplicate submission";
    const path = `/api/v1/operator/builder-league/ledger/${entryId}/reverse`;

    expect(await requestVia(requester, "builder_league", "builder_league.ledger.reverse", { entryId: "missing", reason }, 404)).toBe("not_found");
    const approvalId = await approvedBy(requester, approver, "builder_league", "builder_league.ledger.reverse", { entryId, reason });

    const wrongReason = await reverseEntry(jsonRequest(path, "POST", { reason: "Another reason", approvalId }), params({ entryId }));
    expect(wrongReason.status).toBe(409);

    const reversed = await readJson(await reverseEntry(jsonRequest(path, "POST", { reason, approvalId }), params({ entryId })));
    expect(reversed.data).toMatchObject({ userId: builder.id, rp: -40, reversesEntryId: entryId });
    const rows = await getDb().select().from(scoreLedger).where(eq(scoreLedger.reversesEntryId, entryId));
    expect(rows).toHaveLength(1);
    expect(await auditRows(requester.id, "builder_league.ledger.reverse")).toMatchObject([
      { decision: "deny", reason: "approval_mismatch", resource: `builder_league:ledger:${entryId}` },
      { decision: "allow", approvalId, resource: `builder_league:ledger:${entryId}` },
    ]);

    // The approval is consumed.
    expect((await reverseEntry(jsonRequest(path, "POST", { reason, approvalId }), params({ entryId }))).status).toBe(409);
  });

  it("manages the reward catalogue and decides claims", async () => {
    const operator = await seedOperator(["builder_league:manage"]);
    const builder = await seedUser("claimer");
    setCaller(asCaller(operator, "session"));
    const key = `review-${nextSeq()}`;

    expect((await upsertItem(jsonRequest("/api/v1/operator/builder-league/rewards/items", "POST", { key }))).status).toBe(400);
    const created = await readJson(await upsertItem(jsonRequest("/api/v1/operator/builder-league/rewards/items", "POST", rewardItem(key))));
    expect(created.data).toMatchObject({ key, active: true });
    const items = await readJson(await listItems(getRequest("/api/v1/operator/builder-league/rewards/items")));
    expect(items.data).toEqual(expect.arrayContaining([expect.objectContaining({ key })]));

    await getDb().insert(badgeAwards).values({ userId: builder.id, badgeKey: "first_builder", eventIds: ["e"] });
    const claim = await claimReward(getDb(), builder.id, (created.data as { id: string }).id);
    const claims = await readJson(await listClaims(getRequest("/api/v1/operator/builder-league/rewards/claims?status=requested")));
    expect(claims.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: claim.id, rewardKey: key })]));
    expect((await listClaims(getRequest("/api/v1/operator/builder-league/rewards/claims?status=bogus"))).status).toBe(400);

    const path = `/api/v1/operator/builder-league/rewards/claims/${claim.id}/decision`;
    const approved = await readJson(await decideClaim(jsonRequest(path, "POST", { action: "approve", note: "See you Friday" }), params({ id: claim.id })));
    expect(approved.data).toMatchObject({ id: claim.id, status: "approved" });
    expect((await decideClaim(jsonRequest(path, "POST", { action: "approve" }), params({ id: claim.id }))).status).toBe(409);
    expect((await decideClaim(jsonRequest("/x", "POST", { action: "approve" }), params({ id: "missing" }))).status).toBe(404);
    expect(await auditRows(operator.id, "builder_league.claim.decide")).toHaveLength(3);
  });

  it("exports a member's data and deletes it only with an approval, never one's own", async () => {
    const requester = await seedOperator(["builder_league:manage"]);
    const approver = await seedOperator(["builder_league:manage"]);
    const builder = await seedUser("privacy");
    await addLedger(getDb(), builder.id, { stage: "build", rp: 10, at: new Date() });
    setCaller(asCaller(requester, "session"));

    const exported = await exportData(getRequest(`/api/v1/operator/builder-league/privacy/${builder.id}/export`), params({ userId: builder.id }));
    expect(exported.status).toBe(200);
    const exportActions = await getDb()
      .select()
      .from(builderModerationActions)
      .where(and(eq(builderModerationActions.targetId, builder.id), eq(builderModerationActions.action, "export")));
    expect(exportActions).toMatchObject([{ actorId: requester.id, targetType: "privacy_request" }]);

    const selfApproval = await approvedBy(requester, approver, "builder_league", "builder_league.privacy.delete", { userId: requester.id });
    const self = await deleteData(jsonRequest("/x", "POST", { approvalId: selfApproval }), params({ userId: requester.id }));
    expect(self.status).toBe(409);
    expect((await readJson(self)).error?.code).toBe("self_delete");

    const path = `/api/v1/operator/builder-league/privacy/${builder.id}/delete`;
    expect((await deleteData(jsonRequest(path, "POST", {}), params({ userId: builder.id }))).status).toBe(400);
    const approvalId = await approvedBy(requester, approver, "builder_league", "builder_league.privacy.delete", { userId: builder.id });
    expect((await deleteData(jsonRequest(path, "POST", { approvalId }), params({ userId: builder.id }))).status).toBe(200);
    expect(await auditRows(requester.id, "builder_league.privacy.delete")).toEqual(
      expect.arrayContaining([expect.objectContaining({ decision: "allow", resource: `user:${builder.id}` })])
    );
  });
});

describe("community and system operators", () => {
  it("queues a community reconcile for an existing user", async () => {
    const operator = await seedOperator(["community:manage"]);
    const target = await seedUser("community");
    setCaller(asCaller(operator, "session"));

    const response = await reconcile(jsonRequest("/api/v1/operator/community/reconcile", "POST", { userId: target.id, targets: ["discord_guild"] }));
    expect(response.status).toBe(202);
    expect((await readJson(response)).data).toEqual({ userId: target.id, targets: ["discord_guild"], queued: true });
    const jobs = await getDb().select().from(onboardingJobs).where(eq(onboardingJobs.dedupeKey, `reconcile_access:${target.id}:discord_guild`));
    expect(jobs).toHaveLength(1);

    expect((await reconcile(jsonRequest("/api/v1/operator/community/reconcile", "POST", { userId: "missing" }))).status).toBe(404);
    expect((await reconcile(jsonRequest("/api/v1/operator/community/reconcile", "POST", { userId: target.id, targets: ["slack"] }))).status).toBe(400);
    expect(await auditRows(operator.id, "community.access.reconcile")).toMatchObject([{ decision: "allow", resource: `user:${target.id}` }]);
  });

  it("reports job health without payloads and retries a dead job", async () => {
    const operator = await seedOperator(["system:manage"]);
    const n = nextSeq();
    const [job] = await getDb()
      .insert(onboardingJobs)
      .values({ kind: "reconcile_access", dedupeKey: `dead-job-${n}`, payload: { userId: `secret-user-${n}`, target: "telegram_group" }, status: "dead", attempts: 5, lastError: "boom", nextRunAt: new Date() })
      .returning();
    setCaller(asCaller(operator, "session"));

    const health = await readJson(await jobHealth(getRequest("/api/v1/operator/system/jobs")));
    const dead = (health.data as { dead: { id: string }[] }).dead;
    expect(dead).toEqual(expect.arrayContaining([expect.objectContaining({ id: job.id, target: "telegram_group", lastError: "boom" })]));
    expect(JSON.stringify(health.data)).not.toContain(`secret-user-${n}`);

    const retried = await readJson(await retryJob(jsonRequest(`/x`, "POST"), params({ id: job.id })));
    expect(retried.data).toEqual({ id: job.id, retried: true });
    const [after] = await getDb().select().from(onboardingJobs).where(eq(onboardingJobs.id, job.id));
    expect(after).toMatchObject({ status: "pending", attempts: 0 });

    const missing = await retryJob(jsonRequest(`/x`, "POST"), params({ id: "missing" }));
    expect(missing.status).toBe(409);
    expect((await readJson(missing)).error?.code).toBe("not_retryable");
  });
});
