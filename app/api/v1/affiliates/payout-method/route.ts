import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { activePayoutMethod, payoutMethodView, setPayoutMethod } from "@/lib/referrals/affiliate-payouts";
import { payoutMethodSchema } from "@/lib/referrals/http/affiliate-member-schemas";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import {
  assertAffiliatesEnabled,
  assertSessionCaller,
  requireAffiliateCaller,
  requireEnrolledAffiliate,
} from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/**
 * The caller's active payout method as a masked hint (`null` when none). Session only: API keys and
 * MCP delegations get 403 `session_required`, so agents never see or set payout details.
 */
export async function GET(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const { caller, userId } = await requireAffiliateCaller(request, db);
    assertSessionCaller(caller);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    return ok(payoutMethodView(await activePayoutMethod(db, affiliate.id)));
  });
}

/**
 * Replace the payout method (PayPal, or a Vietnamese bank account for VN residents). Details are sealed
 * at rest; the response carries only the masked hint. Session only, same-site.
 */
export async function PUT(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const now = new Date();
    const { caller, userId } = await requireAffiliateCaller(request, db);
    assertSessionCaller(caller);
    const input = payoutMethodSchema.parse((await readJsonObject(request)).body);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    // zod marks `unknown` keys optional; the domain refuses missing values with a 400.
    const method = await setPayoutMethod(db, affiliate.id, { ...input, type: input.type, payeeType: input.payeeType, residency: input.residency }, now);
    return ok(payoutMethodView(method));
  });
}
