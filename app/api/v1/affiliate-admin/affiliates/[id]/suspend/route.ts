import { ok } from "@/lib/builder-league/http";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { setAffiliateStatus } from "@/lib/referrals/affiliates";
import { operatorAffiliateView } from "@/lib/referrals/affiliate-read-models";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { reasonSchema } from "@/lib/referrals/http/affiliate-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Suspend an active affiliate: new checkouts stop attributing to them and payout previews block them. `reason` (3-300 characters) is kept on the account. */
export async function POST(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.affiliate.suspend",
    prepare: async () => {
      const affiliateId = requirePathParam((await params).id, "id");
      const { reason } = reasonSchema.parse((await readJsonObject(request)).body);
      return { resource: `affiliate:affiliate:${affiliateId}`, args: { affiliateId, reason }, affiliateId, reason };
    },
    run: async ({ db, now }, { affiliateId, reason }) =>
      ok(operatorAffiliateView(await setAffiliateStatus(db, affiliateId, { status: "suspended", reason }, now))),
  });
}
