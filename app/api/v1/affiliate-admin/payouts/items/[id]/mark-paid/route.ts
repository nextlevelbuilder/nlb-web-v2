import { ok } from "@/lib/builder-league/http";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { markPayoutItemPaid } from "@/lib/referrals/affiliate-payouts";
import { payoutItemView } from "@/lib/referrals/affiliate-read-models";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { markPaidSchema } from "@/lib/referrals/http/affiliate-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Record one transfer made outside the system, with the provider's transfer id. Session only (403
 * `session_required` for MCP), the batch must be approved, and recording stays off (403
 * `payouts_disabled`) until `AFFILIATE_PAYOUTS_ENABLED` is set. A reference can be recorded once.
 */
export async function POST(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.payout.mark_paid",
    sessionOnly: true,
    prepare: async () => {
      const itemId = requirePathParam((await params).id, "id");
      const input = markPaidSchema.parse((await readJsonObject(request)).body);
      return {
        resource: `affiliate:payout_item:${itemId}`,
        args: { itemId, ...input },
        details: { payoutCurrency: input.payoutCurrency, payoutAmountMinor: input.payoutAmountMinor },
        itemId,
        input,
      };
    },
    run: async ({ db, now }, { itemId, input }, grant) => ok(payoutItemView(await markPayoutItemPaid(db, itemId, input, grant.actorUserId, now))),
  });
}
