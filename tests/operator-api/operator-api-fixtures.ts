/**
 * Approval helpers for the `/api/v1/operator/*` tests. They drive the real approval routes, so every
 * request and decision goes through the guard, the argument hash and the audit trail.
 */
import { expect } from "vitest";
import type { OperatorDomain } from "@/lib/access/types";
import { POST as requestApproval } from "@/app/api/v1/operator/approvals/route";
import { POST as decideApproval } from "@/app/api/v1/operator/approvals/[id]/decision/route";
import { asCaller, jsonRequest, params, readJson, setCaller, type SeededUser, type TestEnvelope } from "../live-api/live-api-fixtures";

/**
 * Requests an approval as `requester`. Returns the approval id on 201; with `expectStatus` set, returns
 * the error code instead.
 */
export async function requestVia(
  requester: SeededUser,
  domain: OperatorDomain,
  action: string,
  target: Record<string, unknown>,
  expectStatus = 201
): Promise<string> {
  setCaller(asCaller(requester, "session"));
  const response = await requestApproval(jsonRequest(`/api/v1/operator/approvals?domain=${domain}`, "POST", { action, target, reason: "Ticket NLB-1" }));
  expect(response.status).toBe(expectStatus);
  const body = await readJson(response);
  return expectStatus === 201 ? (body.data as { id: string }).id : (body.error?.code as string);
}

/** Decides an approval as `approver` and returns the envelope (status checked against `expectStatus`). */
export async function approveVia(approver: SeededUser, domain: OperatorDomain, approvalId: string, expectStatus = 200, decision: "approve" | "reject" = "approve"): Promise<TestEnvelope> {
  setCaller(asCaller(approver, "session"));
  const response = await decideApproval(jsonRequest(`/api/v1/operator/approvals/${approvalId}/decision?domain=${domain}`, "POST", { decision }), params({ id: approvalId }));
  expect(response.status).toBe(expectStatus);
  return readJson(response);
}

/** Request + approve by a second operator; returns the approval id, ready for `requester` to consume. */
export async function approvedBy(requester: SeededUser, approver: SeededUser, domain: OperatorDomain, action: string, target: Record<string, unknown>): Promise<string> {
  const id = await requestVia(requester, domain, action, target);
  await approveVia(approver, domain, id);
  setCaller(asCaller(requester, "session"));
  return id;
}
