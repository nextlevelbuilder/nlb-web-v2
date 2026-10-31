import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth-api-key", async () => (await import("../live-api/live-api-fixtures")).authApiKeyMock);

import { getDb } from "@/lib/db";
import { affiliateConversions, commissionLedger, operatorApprovals, operatorAuditLogs } from "@/lib/db/schema";
import { DEFAULT_PROGRAM_RULES } from "@/lib/referrals/program-rules";
import { setPayoutMethod } from "@/lib/referrals/affiliate-payouts";
import { matureDueConversions } from "@/lib/referrals/affiliate-conversions";
import { GET as getRules, POST as publishRules } from "@/app/api/v1/affiliate-admin/rules/route";
import { POST as previewRules } from "@/app/api/v1/affiliate-admin/rules/preview/route";
import { GET as listAffiliates } from "@/app/api/v1/affiliate-admin/affiliates/route";
import { POST as suspend } from "@/app/api/v1/affiliate-admin/affiliates/[id]/suspend/route";
import { POST as reinstate } from "@/app/api/v1/affiliate-admin/affiliates/[id]/reinstate/route";
import { GET as listConversions } from "@/app/api/v1/affiliate-admin/conversions/route";
import { POST as holdConversion } from "@/app/api/v1/affiliate-admin/conversions/[id]/hold/route";
import { POST as releaseConversion } from "@/app/api/v1/affiliate-admin/conversions/[id]/release/route";
import { GET as previewPayouts } from "@/app/api/v1/affiliate-admin/payouts/preview/route";
import { GET as listBatches, POST as createBatch } from "@/app/api/v1/affiliate-admin/payouts/batches/route";
import { GET as getBatch } from "@/app/api/v1/affiliate-admin/payouts/batches/[id]/route";
import { POST as approveBatch } from "@/app/api/v1/affiliate-admin/payouts/batches/[id]/approve/route";
import { POST as markPaid } from "@/app/api/v1/affiliate-admin/payouts/items/[id]/mark-paid/route";
import { GET as revealDetails } from "@/app/api/v1/affiliate-admin/payouts/items/[id]/details/route";
import { POST as adjust } from "@/app/api/v1/affiliate-admin/ledger/adjustments/route";
import { GET as reconciliation } from "@/app/api/v1/affiliate-admin/reconciliation/route";
import { GET as listApprovals, POST as requestApproval } from "@/app/api/v1/affiliate-admin/approvals/route";
import { POST as decideApproval } from "@/app/api/v1/affiliate-admin/approvals/[id]/decision/route";
import { GET as getApproval } from "@/app/api/v1/affiliate-admin/approvals/[id]/route";
import {
  TEST_ENCRYPTION_KEY,
  approveAffiliateAction,
  asCaller,
  getRequest,
  jsonRequest,
  params,
  previousPeriod,
  readJson,
  seedOperator,
  seedReferredSale,
  seedUser,
  setCaller,
} from "./referral-api-fixtures";

beforeEach(() => {
  vi.stubEnv("AFFILIATES_ENABLED", "true");
  vi.stubEnv("AFFILIATE_PAYOUTS_ENABLED", "false");
  vi.stubEnv("ONBOARDING_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
  setCaller(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const financeOperator = () => seedOperator(["affiliate:manage"]);

describe("operator access", () => {
  it("refuses anonymous (401), non-operators, other domains and API keys (403), and audits signed-in denies", async () => {
    expect((await getRules(getRequest("/api/v1/affiliate-admin/rules"))).status).toBe(401);

    const member = await seedUser("member");
    setCaller(asCaller(member, "session"));
    const notOperator = await getRules(getRequest("/api/v1/affiliate-admin/rules"));
    expect(notOperator.status).toBe(403);
    expect((await readJson(notOperator)).error?.code).toBe("not_operator");
    const denied = await getDb()
      .select()
      .from(operatorAuditLogs)
      .where(and(eq(operatorAuditLogs.actorUserId, member.id), eq(operatorAuditLogs.decision, "deny")));
    expect(denied.map((row) => row.action)).toEqual(["affiliate.rules.read"]);

    const liveOperator = await seedOperator(["live:manage"]);
    setCaller(asCaller(liveOperator, "session"));
    expect((await readJson(await listAffiliates(getRequest("/api/v1/affiliate-admin/affiliates")))).error?.code).toBe("missing_capability");

    const finance = await financeOperator();
    setCaller(asCaller(finance, "api_key"));
    expect((await readJson(await getRules(getRequest("/api/v1/affiliate-admin/rules")))).error?.code).toBe("credential_not_allowed");
    setCaller(asCaller(finance, "delegation"), "mcp:read");
    expect((await getRules(getRequest("/api/v1/affiliate-admin/rules"))).status).toBe(401);
    setCaller(asCaller(finance, "delegation"), "mcp:operator");
    expect((await getRules(getRequest("/api/v1/affiliate-admin/rules"))).status).toBe(200);
  });

  it("works while AFFILIATES_ENABLED is off", async () => {
    vi.stubEnv("AFFILIATES_ENABLED", "false");
    setCaller(asCaller(await financeOperator(), "session"));
    const response = await getRules(getRequest("/api/v1/affiliate-admin/rules"));
    expect(response.status).toBe(200);
    expect((await readJson(response)).data).toMatchObject({ version: 0, rules: { currency: "usd" } });
  });
});

describe("rules", () => {
  const nextRules = () => ({ ...DEFAULT_PROGRAM_RULES, holdDays: 60 });

  it("previews without writing and validates the invariants", async () => {
    setCaller(asCaller(await financeOperator(), "session"));
    const response = await previewRules(jsonRequest("/api/v1/affiliate-admin/rules/preview", "POST", { rules: nextRules() }));
    expect(response.status).toBe(200);
    const data = (await readJson(response)).data;
    expect(data).toMatchObject({ valid: true, nextVersion: data.currentVersion + 1, rules: { holdDays: 60 } });
    expect(data.levels[0].examples[0]).toEqual({ discountBps: 0, ordinaryCommissionBps: 1000, memberCommissionBps: 2000 });

    const invalid = await previewRules(jsonRequest("/api/v1/affiliate-admin/rules/preview", "POST", { rules: { ...nextRules(), holdDays: 5 } }));
    expect(invalid.status).toBe(400);
    expect((await readJson(invalid)).error?.code).toBe("invalid_input");
    expect((await readJson(await getRules(getRequest("/api/v1/affiliate-admin/rules")))).data.version).toBe(data.currentVersion);
  });

  it("publishes only with a second operator's approval for the same document", async () => {
    const requester = await financeOperator();
    const approver = await financeOperator();
    setCaller(asCaller(requester, "session"));

    const missing = await publishRules(jsonRequest("/api/v1/affiliate-admin/rules", "POST", { rules: nextRules() }));
    expect(missing.status).toBe(409);
    expect((await readJson(missing)).error?.code).toBe("approval_required");

    const approvalId = await approveAffiliateAction(requester, approver, "affiliate.rules.publish", { rules: nextRules(), note: "Longer hold" });
    const pending = await readJson(await getApproval(getRequest(`/api/v1/affiliate-admin/approvals/${approvalId}`), params({ id: approvalId })));
    expect(pending.data).toMatchObject({ id: approvalId, action: "affiliate.rules.publish", status: "approved" });

    const mismatch = await publishRules(jsonRequest("/api/v1/affiliate-admin/rules", "POST", { rules: { ...nextRules(), holdDays: 90 }, note: "Longer hold", approvalId }));
    expect(mismatch.status).toBe(409);
    expect((await readJson(mismatch)).error?.code).toBe("approval_mismatch");

    const published = await publishRules(jsonRequest("/api/v1/affiliate-admin/rules", "POST", { rules: nextRules(), note: "Longer hold", approvalId }));
    expect(published.status).toBe(201);
    const version = (await readJson(published)).data.version;
    expect((await readJson(await getRules(getRequest("/api/v1/affiliate-admin/rules")))).data).toMatchObject({ version, rules: { holdDays: 60 } });

    const replay = await publishRules(jsonRequest("/api/v1/affiliate-admin/rules", "POST", { rules: nextRules(), note: "Longer hold", approvalId }));
    expect((await readJson(replay)).error?.code).toBe("approval_already_used");
  });

  it("refuses a self-approval", async () => {
    const requester = await financeOperator();
    setCaller(asCaller(requester, "session"));
    const requested = await requestApproval(jsonRequest("/api/v1/affiliate-admin/approvals", "POST", { action: "affiliate.rules.publish", target: { rules: nextRules() }, reason: "Self" }));
    const { id } = (await readJson(requested)).data;
    const self = await decideApproval(jsonRequest(`/api/v1/affiliate-admin/approvals/${id}/decision`, "POST", { decision: "approve" }), params({ id }));
    expect(self.status).toBe(409);
    expect((await readJson(self)).error?.code).toBe("approval_self_decision");
  });
});

describe("affiliates and conversions", () => {
  it("lists, suspends, reinstates, holds and releases", async () => {
    const { affiliate } = await seedReferredSale();
    const operator = await financeOperator();
    setCaller(asCaller(operator, "session"));

    const listed = (await readJson(await listAffiliates(getRequest("/api/v1/affiliate-admin/affiliates?status=active")))).data.affiliates;
    expect(listed.find((row: { affiliateId: string }) => row.affiliateId === affiliate.id)).toMatchObject({ status: "active", level: "starter" });
    expect((await listAffiliates(getRequest("/api/v1/affiliate-admin/affiliates?status=bogus"))).status).toBe(400);

    const path = `/api/v1/affiliate-admin/affiliates/${affiliate.id}`;
    expect((await suspend(jsonRequest(`${path}/suspend`, "POST", {}), params({ id: affiliate.id }))).status).toBe(400);
    const suspended = await suspend(jsonRequest(`${path}/suspend`, "POST", { reason: "Fraud review" }), params({ id: affiliate.id }));
    expect((await readJson(suspended)).data).toMatchObject({ status: "suspended", suspendedReason: "Fraud review" });
    expect((await suspend(jsonRequest(`${path}/suspend`, "POST", { reason: "Again" }), params({ id: affiliate.id }))).status).toBe(409);
    const reinstated = await reinstate(jsonRequest(`${path}/reinstate`, "POST", { reason: "Cleared" }), params({ id: affiliate.id }));
    expect((await readJson(reinstated)).data).toMatchObject({ status: "active", suspendedReason: null });
    expect((await suspend(jsonRequest("/x/suspend", "POST", { reason: "Missing" }), params({ id: "missing" }))).status).toBe(404);

    const [conversion] = await getDb().select().from(affiliateConversions).where(eq(affiliateConversions.affiliateId, affiliate.id));
    const pending = (await readJson(await listConversions(getRequest("/api/v1/affiliate-admin/conversions?status=pending")))).data.conversions;
    expect(pending.map((row: { id: string }) => row.id)).toContain(conversion.id);
    const held = await holdConversion(jsonRequest("/h", "POST", { reason: "Chargeback" }), params({ id: conversion.id }));
    expect((await readJson(held)).data).toMatchObject({ status: "held", holdReason: "Chargeback" });
    const released = await releaseConversion(jsonRequest("/r", "POST"), params({ id: conversion.id }));
    expect((await readJson(released)).data).toMatchObject({ status: "pending" });
  });
});

describe("payouts", () => {
  it("creates, approves (with a second operator) and records a batch; details are session only and audited", async () => {
    const period = previousPeriod();
    const { affiliate } = await seedReferredSale();
    await setPayoutMethod(getDb(), affiliate.id, { type: "paypal", payeeType: "individual", residency: "other", paypalEmail: "payee@example.com" });
    const requester = await financeOperator();
    const approver = await financeOperator();
    setCaller(asCaller(requester, "session"));

    // Payout preview is read-only: the commission is still pending until the hourly cron matures it.
    const before = await readJson(await previewPayouts(getRequest(`/api/v1/affiliate-admin/payouts/preview?period=${period}`)));
    expect(before.data.lines.find((line: { affiliateId: string }) => line.affiliateId === affiliate.id)).toBeUndefined();
    await matureDueConversions(getDb());

    const preview = await readJson(await previewPayouts(getRequest(`/api/v1/affiliate-admin/payouts/preview?period=${period}`)));
    expect(preview.data.lines.find((line: { affiliateId: string }) => line.affiliateId === affiliate.id)).toMatchObject({ blockers: [], availableMinor: 5000 });

    const created = await createBatch(jsonRequest("/api/v1/affiliate-admin/payouts/batches", "POST", { period }));
    expect(created.status).toBe(201);
    const batch = (await readJson(created)).data;
    expect(batch).toMatchObject({ period, status: "draft", totals: { items: 1, grossMinor: 5000, netMinor: 4000 } });
    expect(JSON.stringify(batch)).not.toContain("payee@example.com");
    const item = batch.items[0];
    expect((await readJson(await listBatches(getRequest("/api/v1/affiliate-admin/payouts/batches")))).data.batches[0]).toMatchObject({ id: batch.id });

    const unapproved = await approveBatch(jsonRequest("/a", "POST", {}), params({ id: batch.id }));
    expect((await readJson(unapproved)).error?.code).toBe("approval_required");
    const approvalId = await approveAffiliateAction(requester, approver, "affiliate.payout.approve", { batchId: batch.id });
    const pendingList = await readJson(await listApprovals(getRequest("/api/v1/affiliate-admin/approvals?status=approved")));
    expect(pendingList.data.map((row: { id: string }) => row.id)).toContain(approvalId);
    const approved = await approveBatch(jsonRequest("/a", "POST", { approvalId }), params({ id: batch.id }));
    expect(approved.status).toBe(200);
    expect((await readJson(approved)).data).toMatchObject({ status: "approved", approvedBy: requester.id });

    // Approving a batch that is no longer a draft is refused before a second approval is consumed.
    const spareApprovalId = await approveAffiliateAction(requester, approver, "affiliate.payout.approve", { batchId: batch.id });
    const again = await approveBatch(jsonRequest("/a", "POST", { approvalId: spareApprovalId }), params({ id: batch.id }));
    expect(again.status).toBe(409);
    expect((await readJson(again)).error?.code).toBe("invalid_transition");
    const [spare] = await getDb().select().from(operatorApprovals).where(eq(operatorApprovals.id, spareApprovalId));
    expect(spare).toMatchObject({ status: "approved", consumedAt: null });

    // Payee details: MCP refused, session reveal audited without the values.
    setCaller(asCaller(requester, "delegation"), "mcp:operator");
    const delegatedReveal = await revealDetails(getRequest(`/d/${item.id}`), params({ id: item.id }));
    expect((await readJson(delegatedReveal)).error?.code).toBe("session_required");
    setCaller(asCaller(requester, "session"));
    const reveal = await readJson(await revealDetails(getRequest(`/d/${item.id}`), params({ id: item.id })));
    expect(reveal.data).toMatchObject({ itemId: item.id, methodType: "paypal", details: { paypalEmail: "payee@example.com" } });
    const [revealAudit] = await getDb()
      .select()
      .from(operatorAuditLogs)
      .where(and(eq(operatorAuditLogs.action, "affiliate.payout.details.reveal"), eq(operatorAuditLogs.decision, "allow")));
    expect(revealAudit.actorUserId).toBe(requester.id);
    expect(JSON.stringify(revealAudit)).not.toContain("payee@example.com");

    // Recording is session only and gated by AFFILIATE_PAYOUTS_ENABLED.
    const paidBody = { externalReference: "PAYPAL-TX-ROUTE-1", payoutCurrency: "usd", payoutAmountMinor: 4000 };
    setCaller(asCaller(approver, "delegation"), "mcp:operator");
    expect((await readJson(await markPaid(jsonRequest("/p", "POST", paidBody), params({ id: item.id })))).error?.code).toBe("session_required");
    setCaller(asCaller(approver, "session"));
    const disabled = await markPaid(jsonRequest("/p", "POST", paidBody), params({ id: item.id }));
    expect(disabled.status).toBe(403);
    expect((await readJson(disabled)).error?.code).toBe("payouts_disabled");
    vi.stubEnv("AFFILIATE_PAYOUTS_ENABLED", "true");
    const paid = await markPaid(jsonRequest("/p", "POST", paidBody), params({ id: item.id }));
    expect(paid.status).toBe(200);
    expect((await readJson(paid)).data).toMatchObject({ status: "paid", externalReference: "PAYPAL-TX-ROUTE-1" });
    expect((await readJson(await getBatch(getRequest(`/b/${batch.id}`), params({ id: batch.id })))).data.status).toBe("paid");

    const report = await readJson(await reconciliation(getRequest("/api/v1/affiliate-admin/reconciliation")));
    expect(report.data.checks).toEqual({ paidMatchesItems: true, lockedMatchesItems: true, conversionsBalanced: true, bucketsNonNegative: true, noPendingAfterTransition: true });
    expect((await reconciliation(getRequest("/api/v1/affiliate-admin/reconciliation?since=nope"))).status).toBe(400);
  });

  it("adjusts a balance once per approval, keyed by the approval", async () => {
    const { affiliate } = await seedReferredSale();
    const requester = await financeOperator();
    const approver = await financeOperator();
    const target = { affiliateId: affiliate.id, amountMinor: 1234, reason: "Goodwill credit" };

    setCaller(asCaller(requester, "session"));
    expect((await readJson(await adjust(jsonRequest("/l", "POST", target)))).error?.code).toBe("approval_required");
    const approvalId = await approveAffiliateAction(requester, approver, "affiliate.ledger.adjust", target);
    const adjusted = await adjust(jsonRequest("/l", "POST", { ...target, approvalId }));
    expect(adjusted.status).toBe(201);
    expect((await readJson(adjusted)).data).toMatchObject({ recorded: true, balances: { availableMinor: 1234 } });
    const [entry] = await getDb().select().from(commissionLedger).where(eq(commissionLedger.kind, "adjustment"));
    expect(entry.idempotencyKey).toBe(`adjustment:${approvalId}`);

    expect((await readJson(await adjust(jsonRequest("/l", "POST", { ...target, approvalId })))).error?.code).toBe("approval_already_used");
  });
});
