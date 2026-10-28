import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { operatorApprovals, operatorAuditLogs } from "@/lib/db/schema";
import { grantOperatorCapability } from "@/lib/operators/operator-grants";
import { hashOperatorArgs } from "@/lib/operators/operator-audit";
import { consumeApproval, decideApproval, requestApproval } from "@/lib/operators/operator-approvals";
import { requireOperator } from "@/lib/operators/operator-guard";
import { OperatorAccessError } from "@/lib/operators/operator-errors";
import { apiKey, delegation, seedUsers, session } from "../access/access-fixtures";

let local: LocalD1;
const REFUND = "live.ticket.refund" as const;
const RESOURCE = "live:ticket:evt_1";
const ARGS = { ticketId: "t1", reason: "duplicate" };

beforeAll(async () => {
  local = await createLocalD1();
  await seedUsers(local.db, [{ id: "alice" }, { id: "bob" }, { id: "carol" }, { id: "member" }, { id: "banned-op", banned: true }]);
  for (const userId of ["alice", "bob", "banned-op"]) {
    await grantOperatorCapability(local.db, { userId, capability: "live:manage", grantedBy: "bootstrap" });
  }
  // carol operates another domain only.
  await grantOperatorCapability(local.db, { userId: "carol", capability: "courses:manage", grantedBy: "bootstrap" });
});

afterAll(async () => {
  await local?.dispose();
});

async function approved(args: unknown = ARGS, ttlMs?: number, now?: Date): Promise<string> {
  const { id } = await requestApproval(local.db, {
    subject: session("alice"), action: REFUND, resource: RESOURCE, args, reason: "customer asked", ttlMs, now,
  });
  await decideApproval(local.db, { approvalId: id, subject: session("bob"), decision: "approve", now });
  return id;
}

async function expectCode(promise: Promise<unknown>, status: number, code: string): Promise<void> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(OperatorAccessError);
  expect(error).toMatchObject({ status, code });
}

const auditRows = (approvalId: string) =>
  local.db.select().from(operatorAuditLogs).where(eq(operatorAuditLogs.approvalId, approvalId));

describe("approvals", () => {
  it("refuses self-approval and approvers without the action's capability", async () => {
    const { id } = await requestApproval(local.db, {
      subject: session("alice"), action: REFUND, resource: RESOURCE, args: ARGS, reason: "r",
    });
    await expectCode(decideApproval(local.db, { approvalId: id, subject: session("alice"), decision: "approve" }), 409, "approval_self_decision");
    await expectCode(decideApproval(local.db, { approvalId: id, subject: session("carol"), decision: "approve" }), 403, "missing_capability");
    await expectCode(decideApproval(local.db, { approvalId: id, subject: apiKey("bob"), decision: "approve" }), 403, "credential_not_allowed");
    await expectCode(decideApproval(local.db, { approvalId: id, subject: session("banned-op"), decision: "approve" }), 403, "banned");
    const [row] = await local.db.select().from(operatorApprovals).where(eq(operatorApprovals.id, id));
    expect(row.status).toBe("pending");
    // The canonical arguments are stored beside their hash, so the approver can see and re-hash them.
    expect(row.args).toBe('{"reason":"duplicate","ticketId":"t1"}');
    expect(row.argsHash).toBe(hashOperatorArgs(JSON.parse(row.args as string)));
    expect((await auditRows(id)).filter((r) => r.decision === "deny")).toHaveLength(4);
  });

  it("refuses requests from non-operators", async () => {
    await expectCode(
      requestApproval(local.db, { subject: session("member"), action: REFUND, resource: RESOURCE, args: ARGS, reason: "r" }),
      403,
      "not_operator"
    );
  });

  it("refuses to decide an expired request and marks it expired", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const { id } = await requestApproval(local.db, {
      subject: session("alice"), action: REFUND, resource: RESOURCE, args: ARGS, reason: "r", now: past,
    });
    await expectCode(decideApproval(local.db, { approvalId: id, subject: session("bob"), decision: "approve" }), 409, "approval_expired");
    const [row] = await local.db.select().from(operatorApprovals).where(eq(operatorApprovals.id, id));
    expect(row.status).toBe("expired");
  });

  it("consumes once; replay, wrong hash, wrong actor and expiry are refused", async () => {
    const id = await approved();
    const base = { approvalId: id, action: REFUND, resource: RESOURCE, argsHash: hashOperatorArgs(ARGS), actorUserId: "alice" };
    await expectCode(consumeApproval(local.db, { ...base, argsHash: hashOperatorArgs({ ...ARGS, ticketId: "t2" }) }), 409, "approval_mismatch");
    await expectCode(consumeApproval(local.db, { ...base, resource: "live:ticket:evt_2" }), 409, "approval_mismatch");
    await expectCode(consumeApproval(local.db, { ...base, actorUserId: "bob" }), 409, "approval_not_requester");
    await consumeApproval(local.db, base);
    await expectCode(consumeApproval(local.db, base), 409, "approval_already_used");

    const shortLived = await approved(ARGS, 1000);
    await expectCode(
      consumeApproval(local.db, { ...base, approvalId: shortLived, now: new Date(Date.now() + 5000) }),
      409,
      "approval_expired"
    );
    const [row] = await local.db.select().from(operatorApprovals).where(eq(operatorApprovals.id, shortLived));
    expect(row.status).toBe("expired");
  });

  it("refuses rejected and pending approvals", async () => {
    const { id } = await requestApproval(local.db, {
      subject: session("alice"), action: REFUND, resource: RESOURCE, args: ARGS, reason: "r",
    });
    const base = { approvalId: id, action: REFUND, resource: RESOURCE, argsHash: hashOperatorArgs(ARGS), actorUserId: "alice" };
    await expectCode(consumeApproval(local.db, base), 409, "approval_not_approved");
    await decideApproval(local.db, { approvalId: id, subject: session("bob"), decision: "reject" });
    await expectCode(consumeApproval(local.db, base), 409, "approval_not_approved");
    await expectCode(decideApproval(local.db, { approvalId: id, subject: session("bob"), decision: "approve" }), 409, "approval_not_pending");
  });

  it("lets exactly one of two concurrent consumers win", async () => {
    const id = await approved();
    const input = { approvalId: id, action: REFUND, resource: RESOURCE, argsHash: hashOperatorArgs(ARGS), actorUserId: "alice" };
    const results = await Promise.allSettled([consumeApproval(local.db, input), consumeApproval(local.db, input), consumeApproval(local.db, input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
  });
});

describe("requireOperator", () => {
  it("allows a plain operator action and audits it", async () => {
    const grant = await requireOperator({ db: local.db, subject: session("alice"), domain: "live", action: "live.event.create", resource: "live:event:e9", args: { slug: "e9" } });
    expect(grant).toEqual({ actorUserId: "alice", argsHash: hashOperatorArgs({ slug: "e9" }), approvalId: null });
    const rows = await local.db.select().from(operatorAuditLogs).where(eq(operatorAuditLogs.resource, "live:event:e9"));
    expect(rows).toMatchObject([{ decision: "allow", actorUserId: "alice", actorAuthType: "session", argsHash: grant.argsHash }]);
  });

  it("denies and audits API keys, delegations without mcp:operator and non-operators", async () => {
    const attempt = (subject: Parameters<typeof requireOperator>[0]["subject"]) =>
      requireOperator({ db: local.db, subject, domain: "live", action: "live.event.update", resource: "live:event:deny", args: {} });
    await expectCode(attempt(apiKey("alice", ["api:write", "mcp:operator"])), 403, "credential_not_allowed");
    await expectCode(attempt(delegation("alice", ["mcp:write"])), 403, "insufficient_scope");
    await expectCode(attempt(session("member")), 403, "not_operator");
    await expectCode(attempt({ userId: null, authType: "anonymous" }), 401, "unauthenticated");
    await requireOperator({ db: local.db, subject: delegation("alice", ["mcp:operator"]), domain: "live", action: "live.event.update", resource: "live:event:deny", args: {} });
    const rows = await local.db.select().from(operatorAuditLogs).where(eq(operatorAuditLogs.resource, "live:event:deny"));
    expect(rows.map((r) => [r.decision, r.reason])).toEqual(
      expect.arrayContaining([
        ["deny", "credential_not_allowed"], ["deny", "insufficient_scope"], ["deny", "not_operator"], ["deny", "unauthenticated"], ["allow", null],
      ])
    );
    expect(rows.find((r) => r.decision === "allow")?.clientId).toBe("client_test");
  });

  it("requires and consumes an approval for sensitive actions", async () => {
    const run = (approvalId?: string, args: unknown = ARGS) =>
      requireOperator({ db: local.db, subject: session("alice"), domain: "live", action: REFUND, resource: RESOURCE, args, approvalId });
    await expectCode(run(), 409, "approval_required");
    const id = await approved();
    await expectCode(run(id, { ...ARGS, ticketId: "other" }), 409, "approval_mismatch");
    expect(await run(id)).toEqual({ actorUserId: "alice", argsHash: hashOperatorArgs(ARGS), approvalId: id });
    await expectCode(run(id), 409, "approval_already_used");
    await expectCode(
      requireOperator({ db: local.db, subject: session("alice"), domain: "courses", action: REFUND, resource: RESOURCE, args: ARGS, approvalId: id }),
      403,
      "missing_capability"
    );
    const decisions = (await auditRows(id)).filter((r) => r.action === REFUND).map((r) => [r.decision, r.reason]);
    expect(decisions).toEqual(
      expect.arrayContaining([["deny", "approval_mismatch"], ["allow", null], ["deny", "approval_already_used"]])
    );
  });
});
