/**
 * Shared helpers for the affiliate REST tests. Caller resolution, users, operators and requests come
 * from the Live REST fixtures (the faithful `resolveCaller` stand-in); referral seeds run the real
 * checkout attribution and order sync, so every guard, policy and domain module runs unmodified.
 * Each test file mocks `@/lib/auth-api-key` with `authApiKeyMock` before importing any route.
 */
import { expect } from "vitest";
import { getDb } from "@/lib/db";
import { attributeCheckout } from "@/lib/referrals/affiliate-checkout";
import { syncReferralOrder } from "@/lib/referrals/affiliate-conversions";
import { POST as requestApproval } from "@/app/api/v1/affiliate-admin/approvals/route";
import { POST as decideApproval } from "@/app/api/v1/affiliate-admin/approvals/[id]/decision/route";
import { asCaller, jsonRequest, params, readJson, setCaller, type SeededUser } from "../live-api/live-api-fixtures";
import { PREMIUM, fakeDiscounts, nextSeq, paidOrder, seedAffiliateWithLink, seedUser as seedReferralUser } from "../referrals/referral-fixtures";

export {
  asCaller,
  authApiKeyMock,
  getRequest,
  jsonRequest,
  params,
  readJson,
  seedOperator,
  seedUser,
  setCaller,
  TEST_ENCRYPTION_KEY,
  type SeededUser,
} from "../live-api/live-api-fixtures";

/** The last closed month (UTC) relative to now, `YYYY-MM`. */
export function previousPeriod(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * An affiliate with one referred first purchase paid `paidAt` (net 50_000 at the 10% starter budget,
 * so 5000 commission). The commission stays `pending` until maturation runs (the hourly cron or
 * batch creation); payout preview never writes.
 */
export async function seedReferredSale(paidAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)) {
  const seeded = await seedAffiliateWithLink(0);
  const buyer = await seedReferralUser("buyer");
  const attempt = await attributeCheckout(getDb(), fakeDiscounts(), { buyerUserId: buyer.id, polarProductId: PREMIUM, explicitCode: seeded.link.code });
  if (!attempt.applied) throw new Error(`not applied: ${attempt.reason}`);
  const orderId = `order-${nextSeq()}`;
  const outcome = await syncReferralOrder(
    getDb(),
    paidOrder({ orderId, attributionId: attempt.attributionId, buyerUserId: buyer.id, discountId: null, net: 50_000, createdAt: paidAt }),
    paidAt
  );
  if (outcome !== "accrued") throw new Error(`expected an accrual, got ${outcome}`);
  return { ...seeded, buyer, orderId };
}

/** `requester` asks for an approval of `action` on `target`; `approver` (another operator) approves it. */
export async function approveAffiliateAction(requester: SeededUser, approver: SeededUser, action: string, target: Record<string, unknown>): Promise<string> {
  setCaller(asCaller(requester, "session"));
  const requested = await requestApproval(jsonRequest("/api/v1/affiliate-admin/approvals", "POST", { action, target, reason: "Finance review" }));
  expect(requested.status).toBe(201);
  const { id } = (await readJson(requested)).data as { id: string };
  setCaller(asCaller(approver, "session"));
  const decided = await decideApproval(jsonRequest(`/api/v1/affiliate-admin/approvals/${id}/decision`, "POST", { decision: "approve" }), params({ id }));
  expect((await readJson(decided)).data).toMatchObject({ id, status: "approved" });
  setCaller(asCaller(requester, "session"));
  return id;
}
