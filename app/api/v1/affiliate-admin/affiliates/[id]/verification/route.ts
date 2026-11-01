import { ok } from "@/lib/builder-league/http";
import { requirePathParam } from "@/lib/live/http/live-request-context";
import { findAffiliateById } from "@/lib/referrals/affiliates";
import { findVerification, verificationView } from "@/lib/referrals/affiliate-verification";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { referralNotFound } from "@/lib/referrals/referral-errors";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** An affiliate's identity verification status and provider decision labels. No document data exists to show. */
export async function GET(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.verification.read",
    prepare: async ({ db }) => {
      const affiliateId = requirePathParam((await params).id, "id");
      if (!(await findAffiliateById(db, affiliateId))) throw referralNotFound("Affiliate");
      return { resource: `affiliate:affiliate:${affiliateId}`, args: { affiliateId }, affiliateId };
    },
    run: async ({ db }, { affiliateId }) => ok(verificationView(await findVerification(db, affiliateId))),
  });
}
