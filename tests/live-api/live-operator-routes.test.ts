import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth-api-key", async () => (await import("./live-api-fixtures")).authApiKeyMock);

/** Fake Polar SDK object: refunds go through `orders.get` then `refunds.create`. */
const polarFake = vi.hoisted(() => ({
  checkouts: { create: vi.fn() },
  products: { create: vi.fn(), update: vi.fn() },
  orders: { get: vi.fn() },
  refunds: { create: vi.fn() },
}));
vi.mock("@/lib/polar", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/polar")>()), polar: polarFake }));

import { getDb } from "@/lib/db";
import { liveTickets, operatorAuditLogs } from "@/lib/db/schema";
import { POST as createEvent } from "@/app/api/v1/live-admin/events/route";
import { POST as cancelEvent } from "@/app/api/v1/live-admin/events/[id]/cancel/route";
import { GET as eventTickets } from "@/app/api/v1/live-admin/events/[id]/tickets/route";
import { POST as createTopicGroup } from "@/app/api/v1/live-admin/topic-groups/route";
import { POST as refundTicket } from "@/app/api/v1/live-admin/tickets/[id]/refund/route";
import { GET as listApprovals, POST as requestApproval } from "@/app/api/v1/live-admin/approvals/route";
import { GET as getApproval } from "@/app/api/v1/live-admin/approvals/[id]/route";
import { POST as decideApproval } from "@/app/api/v1/live-admin/approvals/[id]/decision/route";
import { GET as auditLog } from "@/app/api/v1/live-admin/audit/route";
import {
  asCaller,
  getRequest,
  jsonRequest,
  nextSeq,
  params,
  readJson,
  seedOnSaleEvent,
  seedOperator,
  seedTicketHolder,
  seedUser,
  setCaller,
  type SeededUser,
} from "./live-api-fixtures";

const eventBody = () => {
  const n = nextSeq();
  return {
    slug: `admin-event-${n}`,
    titleEn: "Admin event",
    titleVi: "Sự kiện",
    startsAt: "2031-03-02T20:00:00+07:00",
    endsAt: "2031-03-02T22:00:00+07:00",
    hostName: "Host",
    capacity: 10,
    priceCents: 1900,
  };
};

const actorRows = (userId: string | null, action: string) =>
  getDb()
    .select()
    .from(operatorAuditLogs)
    .where(and(eq(operatorAuditLogs.action, action), userId ? eq(operatorAuditLogs.actorUserId, userId) : eq(operatorAuditLogs.actorAuthType, "anonymous")));

async function ticketIdOf(eventId: string, userId: string): Promise<string> {
  const [ticket] = await getDb().select().from(liveTickets).where(and(eq(liveTickets.eventId, eventId), eq(liveTickets.userId, userId)));
  return ticket.id;
}

async function approve(requester: SeededUser, approver: SeededUser, action: string, target: Record<string, string>): Promise<string> {
  setCaller(asCaller(requester, "session"));
  const requested = await requestApproval(jsonRequest("/api/v1/live-admin/approvals", "POST", { action, target, reason: "Customer asked" }));
  expect(requested.status).toBe(201);
  const { id } = (await readJson(requested)).data as { id: string };
  setCaller(asCaller(approver, "session"));
  const decided = await decideApproval(jsonRequest(`/api/v1/live-admin/approvals/${id}/decision`, "POST", { decision: "approve" }), params({ id }));
  expect((await readJson(decided)).data).toMatchObject({ id, status: "approved" });
  return id;
}

beforeEach(() => {
  setCaller(null);
  polarFake.orders.get.mockReset();
  polarFake.refunds.create.mockReset();
});

describe("operator access", () => {
  it("refuses anonymous, members, API keys, other-domain operators and non-operator delegations, auditing signed-in denies", async () => {
    const member = await seedUser("member");
    const keyOperator = await seedOperator(["live:manage"]);
    const coursesOperator = await seedOperator(["courses:manage"]);
    const agentOperator = await seedOperator(["live:manage"]);
    const attempt = () => createEvent(jsonRequest("/api/v1/live-admin/events", "POST", eventBody()));

    setCaller(null);
    expect((await attempt()).status).toBe(401);

    const cases: [SeededUser, Parameters<typeof asCaller>[1], number, string][] = [
      [member, "session", 403, "not_operator"],
      [keyOperator, "api_key", 403, "credential_not_allowed"],
      [coursesOperator, "session", 403, "missing_capability"],
    ];
    for (const [user, authType, status, code] of cases) {
      setCaller(asCaller(user, authType));
      const response = await attempt();
      expect(response.status).toBe(status);
      expect((await readJson(response)).error?.code).toBe(code);
      expect(await actorRows(user.id, "live.event.create")).toMatchObject([{ decision: "deny", reason: code, resource: "operator:live" }]);
    }

    // A delegation not signed for mcp:operator never resolves to a caller.
    setCaller(asCaller(agentOperator, "delegation"), "mcp:write");
    expect((await attempt()).status).toBe(401);
    // Anonymous denies are refused without an audit row, so looping the URL cannot flood the trail.
    expect(await actorRows(null, "live.event.create")).toEqual([]);

    // Signed for mcp:operator, the same operator gets through.
    setCaller(asCaller(agentOperator, "delegation"), "mcp:operator");
    const created = await attempt();
    expect(created.status).toBe(201);
    expect(await actorRows(agentOperator.id, "live.event.create")).toMatchObject([{ decision: "allow", actorAuthType: "delegation" }]);
  });

  it("refuses a member before validating input, so record existence never leaks", async () => {
    const member = await seedUser("prober");
    setCaller(asCaller(member, "session"));
    const response = await refundTicket(jsonRequest("/api/v1/live-admin/tickets/missing/refund", "POST", { nope: true }), params({ id: "missing" }));
    expect(response.status).toBe(403);
    expect((await readJson(response)).error?.code).toBe("not_operator");
  });

  it("lets an operator create, validates input, and pages the audit log", async () => {
    const operator = await seedOperator();
    setCaller(asCaller(operator, "session"));
    const n = nextSeq();
    const created = await createTopicGroup(jsonRequest("/api/v1/live-admin/topic-groups", "POST", { slug: `admin-group-${n}`, titleEn: "G", titleVi: "N" }));
    expect(created.status).toBe(201);
    const invalid = await createTopicGroup(jsonRequest("/api/v1/live-admin/topic-groups", "POST", { slug: "x", titleEn: "G", titleVi: "N", extra: 1 }));
    expect(invalid.status).toBe(400);
    const page = await readJson(await auditLog(getRequest("/api/v1/live-admin/audit?limit=2")));
    expect(page.data).toHaveLength(2);
    expect(page).toHaveProperty("pagination");
  });
});

describe("sensitive actions", () => {
  it("refuses a refund and a cancellation without an approval, auditing both", async () => {
    const operator = await seedOperator();
    const event = await seedOnSaleEvent();
    const buyer = await seedUser("refund-none");
    await seedTicketHolder(event, buyer);
    const ticketId = await ticketIdOf(event.id, buyer.id);
    setCaller(asCaller(operator, "session"));

    const refund = await refundTicket(jsonRequest(`/api/v1/live-admin/tickets/${ticketId}/refund`, "POST", {}), params({ id: ticketId }));
    expect(refund.status).toBe(409);
    expect((await readJson(refund)).error?.code).toBe("approval_required");
    const cancel = await cancelEvent(jsonRequest(`/api/v1/live-admin/events/${event.id}/cancel`, "POST", {}), params({ id: event.id }));
    expect(cancel.status).toBe(409);
    expect((await readJson(cancel)).error?.code).toBe("approval_required");

    expect(await actorRows(operator.id, "live.ticket.refund")).toMatchObject([{ decision: "deny", reason: "approval_required", resource: `live:ticket:${event.id}` }]);
    expect(await actorRows(operator.id, "live.event.cancel")).toMatchObject([{ decision: "deny", reason: "approval_required", resource: `live:event:${event.id}` }]);
    expect(polarFake.refunds.create).not.toHaveBeenCalled();
  });

  it("refuses self-approval", async () => {
    const operator = await seedOperator();
    const event = await seedOnSaleEvent();
    setCaller(asCaller(operator, "session"));
    const requested = await requestApproval(jsonRequest("/api/v1/live-admin/approvals", "POST", { action: "live.event.cancel", target: { eventId: event.id }, reason: "Host sick" }));
    const { id } = (await readJson(requested)).data as { id: string };
    const decided = await decideApproval(jsonRequest(`/api/v1/live-admin/approvals/${id}/decision`, "POST", { decision: "approve" }), params({ id }));
    expect(decided.status).toBe(409);
    expect((await readJson(decided)).error?.code).toBe("approval_self_decision");
  });

  it("shows the approver what an approval covers, and only to operators", async () => {
    const requester = await seedOperator();
    const approver = await seedOperator();
    const member = await seedUser("approval-peek");
    const event = await seedOnSaleEvent();
    const buyer = await seedUser("approval-buyer");
    await seedTicketHolder(event, buyer);
    const ticketId = await ticketIdOf(event.id, buyer.id);
    setCaller(asCaller(requester, "session"));
    const requested = await requestApproval(jsonRequest("/api/v1/live-admin/approvals", "POST", { action: "live.ticket.refund", target: { ticketId }, reason: "Double charge" }));
    const { id, argsHash } = (await readJson(requested)).data as { id: string; argsHash: string };

    setCaller(asCaller(approver, "session"));
    const expected = {
      id, action: "live.ticket.refund", resource: `live:ticket:${event.id}`, args: { ticketId }, argsHash,
      reason: "Double charge", requestedBy: requester.id, status: "pending", decidedBy: null, decidedAt: null, consumedAt: null,
    };
    const detail = await getApproval(getRequest(`/api/v1/live-admin/approvals/${id}`), params({ id }));
    expect(detail.status).toBe(200);
    expect((await readJson(detail)).data).toMatchObject(expected);
    const pending = await readJson(await listApprovals(getRequest("/api/v1/live-admin/approvals?limit=100")));
    expect(pending.data).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
    expect(pending).toHaveProperty("pagination");
    expect(await actorRows(approver.id, "live.approval.read")).toMatchObject([{ decision: "allow", resource: `approval:${id}` }]);
    expect(await actorRows(approver.id, "live.approval.list")).toMatchObject([{ decision: "allow" }]);

    await decideApproval(jsonRequest(`/api/v1/live-admin/approvals/${id}/decision`, "POST", { decision: "reject" }), params({ id }));
    const stillPending = await readJson(await listApprovals(getRequest("/api/v1/live-admin/approvals?limit=100")));
    expect((stillPending.data as { id: string }[]).some((row) => row.id === id)).toBe(false);
    const rejected = await readJson(await listApprovals(getRequest("/api/v1/live-admin/approvals?status=rejected&limit=100")));
    expect(rejected.data).toEqual(expect.arrayContaining([expect.objectContaining({ id, status: "rejected", decidedBy: approver.id })]));
    expect((await listApprovals(getRequest("/api/v1/live-admin/approvals?status=bogus"))).status).toBe(400);
    expect((await getApproval(getRequest("/api/v1/live-admin/approvals/missing"), params({ id: "missing" }))).status).toBe(404);

    setCaller(asCaller(member, "session"));
    const refused = await getApproval(getRequest(`/api/v1/live-admin/approvals/${id}`), params({ id }));
    expect(refused.status).toBe(403);
    expect(JSON.stringify(await readJson(refused))).not.toContain(ticketId);
  });

  it("refunds through Polar with a second operator's approval, leaves the ticket to the webhook and refuses a replay", async () => {
    const requester = await seedOperator();
    const approver = await seedOperator();
    const event = await seedOnSaleEvent();
    const buyer = await seedUser("refund-buyer");
    const orderId = await seedTicketHolder(event, buyer);
    const ticketId = await ticketIdOf(event.id, buyer.id);
    polarFake.orders.get.mockResolvedValue({ id: orderId, netAmount: 1900, refundedAmount: 0, currency: "usd" });
    polarFake.refunds.create.mockResolvedValue({ id: "refund-1", status: "pending", amount: 1900, currency: "usd" });

    const approvalId = await approve(requester, approver, "live.ticket.refund", { ticketId });
    setCaller(asCaller(requester, "session"));
    const refundRequest = () => jsonRequest(`/api/v1/live-admin/tickets/${ticketId}/refund`, "POST", { approvalId, reason: "customer_request" });

    const refunded = await refundTicket(refundRequest(), params({ id: ticketId }));
    expect(refunded.status).toBe(202);
    expect((await readJson(refunded)).data).toMatchObject({ ticketId, eventId: event.id, refundId: "refund-1", refundStatus: "pending", amount: 1900, ticketStatus: "active" });
    expect(polarFake.orders.get).toHaveBeenCalledWith({ id: orderId });
    expect(polarFake.refunds.create).toHaveBeenCalledTimes(1);
    expect(polarFake.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ orderId, amount: 1900, reason: "customer_request", metadata: expect.objectContaining({ ticketId }) })
    );
    const [ticket] = await getDb().select().from(liveTickets).where(eq(liveTickets.id, ticketId));
    expect(ticket.status).toBe("active");

    const replay = await refundTicket(refundRequest(), params({ id: ticketId }));
    expect(replay.status).toBe(409);
    expect((await readJson(replay)).error?.code).toBe("approval_already_used");
    expect(polarFake.refunds.create).toHaveBeenCalledTimes(1);

    const rows = await actorRows(requester.id, "live.ticket.refund");
    expect(rows.map((row) => [row.decision, row.reason])).toEqual(expect.arrayContaining([["allow", null], ["deny", "approval_already_used"]]));
    expect(rows.find((row) => row.decision === "allow")?.approvalId).toBe(approvalId);

    // Operators see the ticket list for the event; members never do.
    const tickets = await readJson(await eventTickets(getRequest(`/api/v1/live-admin/events/${event.id}/tickets`), params({ id: event.id })));
    expect(tickets.data.tickets.map((t: { id: string }) => t.id)).toContain(ticketId);
  });

  it("maps a Polar refund failure to 502 without touching the ticket", async () => {
    const requester = await seedOperator();
    const approver = await seedOperator();
    const event = await seedOnSaleEvent();
    const buyer = await seedUser("refund-fail");
    const orderId = await seedTicketHolder(event, buyer);
    const ticketId = await ticketIdOf(event.id, buyer.id);
    polarFake.orders.get.mockResolvedValue({ id: orderId, netAmount: 1900, refundedAmount: 0, currency: "usd" });
    polarFake.refunds.create.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 500 }));

    const approvalId = await approve(requester, approver, "live.ticket.refund", { ticketId });
    setCaller(asCaller(requester, "session"));
    const response = await refundTicket(jsonRequest(`/api/v1/live-admin/tickets/${ticketId}/refund`, "POST", { approvalId }), params({ id: ticketId }));
    expect(response.status).toBe(502);
    expect((await readJson(response)).error?.code).toBe("refund_failed");
    const [ticket] = await getDb().select().from(liveTickets).where(eq(liveTickets.id, ticketId));
    expect(ticket.status).toBe("active");
  });
});
