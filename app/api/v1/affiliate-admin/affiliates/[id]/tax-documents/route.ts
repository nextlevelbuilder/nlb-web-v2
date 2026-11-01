import { requirePathParam } from "@/lib/live/http/live-request-context";
import { findAffiliateById } from "@/lib/referrals/affiliates";
import { parseTaxYear, taxStatementResponse } from "@/lib/referrals/affiliate-tax-documents";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { referralNotFound } from "@/lib/referrals/referral-errors";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** An affiliate's withholding statement for a tax year (`?year=`, `?format=json|csv`), for issuing the official certificate. Audited. */
export async function GET(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.tax_document.read",
    prepare: async ({ db, now }) => {
      const affiliateId = requirePathParam((await params).id, "id");
      const year = parseTaxYear(new URL(request.url).searchParams.get("year"), now);
      if (!(await findAffiliateById(db, affiliateId))) throw referralNotFound("Affiliate");
      return { resource: `affiliate:affiliate:${affiliateId}`, args: { affiliateId, year }, affiliateId };
    },
    run: async ({ db, now }, { affiliateId }) => taxStatementResponse(db, affiliateId, new URL(request.url), now),
  });
}
