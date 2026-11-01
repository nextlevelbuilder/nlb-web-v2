import { getDb } from "@/lib/db";
import { taxStatementResponse } from "@/lib/referrals/affiliate-tax-documents";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import { assertAffiliatesEnabled, requireAffiliateCaller, requireEnrolledAffiliate } from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/**
 * The caller's withholding statement for a tax year (`?year=`, Vietnam time; default the current year):
 * each recorded payout with gross, service fee, tax withheld, rates and net, plus totals.
 * `?format=csv` returns a spreadsheet file instead of JSON.
 */
export async function GET(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const { userId } = await requireAffiliateCaller(request, db);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    return taxStatementResponse(db, affiliate.id, new URL(request.url));
  });
}
