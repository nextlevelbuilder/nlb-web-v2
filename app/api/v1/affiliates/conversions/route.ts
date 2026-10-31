import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { listConversions } from "@/lib/referrals/affiliate-read-models";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import {
  assertAffiliatesEnabled,
  parseBoundedInt,
  requireAffiliateCaller,
  requireEnrolledAffiliate,
} from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/** The caller's conversions, newest first (`limit` default 50, max 200): date, plan and amounts, never the buyer. */
export async function GET(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const limit = parseBoundedInt(new URL(request.url).searchParams.get("limit"), "limit", 50, 200);
    const { userId } = await requireAffiliateCaller(request, db);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    return ok({ conversions: await listConversions(db, affiliate.id, limit) });
  });
}
