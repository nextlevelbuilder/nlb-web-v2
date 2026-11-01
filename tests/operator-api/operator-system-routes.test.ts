import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth-api-key", async () => (await import("../live-api/live-api-fixtures")).authApiKeyMock);

import { getDb } from "@/lib/db";
import { operatorAuditLogs } from "@/lib/db/schema";
import { getOperatorCapabilities } from "@/lib/operators/operator-grants";
import { GET as listOperators, POST as grantCapability } from "@/app/api/v1/operator/system/operators/route";
import { POST as revokeCapability } from "@/app/api/v1/operator/system/operators/revoke/route";
import { GET as readAudit } from "@/app/api/v1/operator/system/audit/route";
import { GET as listApprovals } from "@/app/api/v1/operator/approvals/route";
import { GET as getApproval } from "@/app/api/v1/operator/approvals/[id]/route";
import { asCaller, getRequest, jsonRequest, params, readJson, seedOperator, seedUser, setCaller } from "../live-api/live-api-fixtures";
import { approveVia, requestVia } from "./operator-api-fixtures";

const auditRows = (actorUserId: string, action: string) =>
  getDb().select().from(operatorAuditLogs).where(and(eq(operatorAuditLogs.actorUserId, actorUserId), eq(operatorAuditLogs.action, action)));

beforeEach(() => setCaller(null));

describe("operator system: access", () => {
  it("refuses anonymous, members, other-domain operators and API keys before reading input", async () => {
    const member = await seedUser("member");
    const coursesOperator = await seedOperator(["courses:manage"]);
    const keyOperator = await seedOperator(["system:manage"]);
    expect((await listOperators(getRequest("/api/v1/operator/system/operators"))).status).toBe(401);

    const cases: [typeof member, "session" | "api_key", string][] = [
      [member, "session", "not_operator"],
      [coursesOperator, "session", "missing_capability"],
      [keyOperator, "api_key", "credential_not_allowed"],
    ];
    for (const [user, authType, code] of cases) {
      setCaller(asCaller(user, authType));
      const response = await grantCapability(jsonRequest("/api/v1/operator/system/operators", "POST", { junk: true }));
      expect(response.status).toBe(403);
      expect((await readJson(response)).error?.code).toBe(code);
      expect(await auditRows(user.id, "operator.grant")).toMatchObject([{ decision: "deny", reason: code, resource: "operator:system" }]);
    }
  });

  it("refuses a delegation not signed for mcp:operator and keeps grants session-only", async () => {
    const operator = await seedOperator(["system:manage"]);
    setCaller(asCaller(operator, "delegation"), "mcp:write");
    expect((await listOperators(getRequest("/api/v1/operator/system/operators"))).status).toBe(401);
    setCaller(asCaller(operator, "delegation"), "mcp:operator");
    expect((await listOperators(getRequest("/api/v1/operator/system/operators"))).status).toBe(200);
    const target = await seedUser("target");
    const response = await grantCapability(jsonRequest("/api/v1/operator/system/operators", "POST", { userId: target.id, capability: "courses:manage", approvalId: "x" }));
    expect(response.status).toBe(403);
    expect((await readJson(response)).error?.code).toBe("session_required");
  });
});

describe("operator system: two-person grant and revoke", () => {
  it("grants and revokes a capability only with an approval from a different operator, bound to the exact arguments", async () => {
    const requester = await seedOperator(["system:manage"]);
    const approver = await seedOperator(["system:manage"]);
    const target = await seedUser("target");
    const grant = (body: Record<string, unknown>) => grantCapability(jsonRequest("/api/v1/operator/system/operators", "POST", body));

    setCaller(asCaller(requester, "session"));
    const missing = await grant({ userId: target.id, capability: "courses:manage" });
    expect(missing.status).toBe(400);
    const noApproval = await grant({ userId: target.id, capability: "courses:manage", approvalId: "nope" });
    expect((await readJson(noApproval)).error?.code).toBe("approval_not_found");

    // Self-approval is refused.
    const selfId = await requestVia(requester, "system", "operator.grant", { userId: target.id, capability: "courses:manage" });
    const selfDecision = await approveVia(requester, "system", selfId, 409);
    expect(selfDecision.error?.code).toBe("approval_self_decision");

    const approvalId = await requestVia(requester, "system", "operator.grant", { userId: target.id, capability: "courses:manage" });
    await approveVia(approver, "system", approvalId);
    setCaller(asCaller(requester, "session"));
    // Same approval, different capability: the argument hash does not match.
    const mismatch = await grant({ userId: target.id, capability: "commerce:manage", approvalId });
    expect((await readJson(mismatch)).error?.code).toBe("approval_mismatch");
    const granted = await grant({ userId: target.id, capability: "courses:manage", approvalId });
    expect(granted.status).toBe(201);
    expect(await getOperatorCapabilities(getDb(), target.id)).toEqual(["courses:manage"]);
    // Replaying the consumed approval changes nothing.
    const replay = await grant({ userId: target.id, capability: "courses:manage", approvalId });
    expect((await readJson(replay)).error?.code).toBe("approval_already_used");
    expect(await auditRows(requester.id, "operator.grant")).toEqual(
      expect.arrayContaining([expect.objectContaining({ decision: "allow", resource: `user:${target.id}`, approvalId })])
    );

    const revokeId = await requestVia(requester, "system", "operator.revoke", { userId: target.id, capability: "courses:manage" });
    await approveVia(approver, "system", revokeId);
    setCaller(asCaller(requester, "session"));
    const revoked = await revokeCapability(jsonRequest("/api/v1/operator/system/operators/revoke", "POST", { userId: target.id, capability: "courses:manage", approvalId: revokeId }));
    expect(revoked.status).toBe(200);
    expect(await getOperatorCapabilities(getDb(), target.id)).toEqual([]);
  });
});

describe("operator approvals and audit", () => {
  it("validates ?domain= and limits approval reads to that domain", async () => {
    const systemOperator = await seedOperator(["system:manage", "courses:manage"]);
    const target = await seedUser("target");
    setCaller(asCaller(systemOperator, "session"));
    expect((await listApprovals(getRequest("/api/v1/operator/approvals"))).status).toBe(400);
    expect((await listApprovals(getRequest("/api/v1/operator/approvals?domain=nope"))).status).toBe(400);

    const approvalId = await requestVia(systemOperator, "system", "operator.grant", { userId: target.id, capability: "assets:manage" });
    const sameDomain = await getApproval(getRequest(`/api/v1/operator/approvals/${approvalId}?domain=system`), params({ id: approvalId }));
    expect((await readJson(sameDomain)).data).toMatchObject({ id: approvalId, action: "operator.grant", status: "pending" });
    const otherDomain = await getApproval(getRequest(`/api/v1/operator/approvals/${approvalId}?domain=courses`), params({ id: approvalId }));
    expect(otherDomain.status).toBe(404);

    // A system action cannot be requested under another domain.
    setCaller(asCaller(systemOperator, "session"));
    const crossed = await requestVia(systemOperator, "courses", "operator.grant", { userId: target.id, capability: "assets:manage" }, 409);
    expect(crossed).toBe("approval_domain_mismatch");
  });

  it("pages the whole audit trail for system operators only", async () => {
    const systemOperator = await seedOperator(["system:manage"]);
    setCaller(asCaller(systemOperator, "session"));
    const page = await readJson(await readAudit(getRequest("/api/v1/operator/system/audit?limit=2")));
    expect(page.data).toHaveLength(2);
    expect(page).toHaveProperty("pagination");
    expect(await auditRows(systemOperator.id, "system.audit.read")).toMatchObject([{ decision: "allow" }]);
  });
});
