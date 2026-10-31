import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { affiliateBalances } from "@/lib/referrals/commission-ledger";
import { balancesView, listLedger } from "@/lib/referrals/affiliate-read-models";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import {
  assertAffiliatesEnabled,
  parseBoundedInt,
  requireAffiliateCaller,
  requireEnrolledAffiliate,
} from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/** The caller's balances per bucket and ledger movements, newest first (`limit` default 100, max 500). */
export async function GET(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const limit = parseBoundedInt(new URL(request.url).searchParams.get("limit"), "limit", 100, 500);
    const { userId } = await requireAffiliateCaller(request, db);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    const [balances, ledger] = await Promise.all([affiliateBalances(db, affiliate.id), listLedger(db, affiliate.id, limit)]);
    return ok({ balances: balancesView(balances), ledger });
  });
}
