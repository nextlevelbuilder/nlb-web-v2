import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { listAffiliatePayouts } from "@/lib/referrals/affiliate-read-models";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import { assertAffiliatesEnabled, requireAffiliateCaller, requireEnrolledAffiliate } from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/** The caller's payouts, newest period first: amounts, fees, withholding, status and transfer reference. */
export async function GET(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const { userId } = await requireAffiliateCaller(request, db);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    return ok({ payouts: await listAffiliatePayouts(db, affiliate.id) });
  });
}
