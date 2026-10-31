import { ok } from "@/lib/builder-league/http";
import { requirePathParam } from "@/lib/live/http/live-request-context";
import { revealPayoutDetails } from "@/lib/referrals/affiliate-payouts";
import { findPayoutItemWithMethod } from "@/lib/referrals/affiliate-read-models";
import { referralNotFound } from "@/lib/referrals/referral-errors";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Reveal the payee's transfer details of one payout item, for the operator making the transfer. Session
 * only (403 `session_required` for MCP); every reveal writes an audit row that names the item and method
 * type, never the details themselves. The response is `no-store`.
 */
export async function GET(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.payout.details.reveal",
    sessionOnly: true,
    prepare: async ({ db }) => {
      const itemId = requirePathParam((await params).id, "id");
      const found = await findPayoutItemWithMethod(db, itemId);
      if (!found) throw referralNotFound("Payout item");
      return {
        resource: `affiliate:payout_item:${itemId}`,
        args: { itemId },
        details: { affiliateId: found.item.affiliateId, methodType: found.method.type },
        found,
      };
    },
    run: async (_ctx, { found: { item, method } }) =>
      ok({
        itemId: item.id,
        affiliateId: item.affiliateId,
        methodType: method.type,
        displayHint: method.displayHint,
        payeeType: method.payeeType,
        residency: method.residency,
        details: await revealPayoutDetails(method),
      }),
  });
}
