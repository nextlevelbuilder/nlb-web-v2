import { ok } from "@/lib/builder-league/http";
import { assertClosedPeriod, previewPayouts } from "@/lib/referrals/affiliate-payouts";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";

export const dynamic = "force-dynamic";

/**
 * What a batch for the closed month `?period=YYYY-MM` would pay now: each affiliate with an available
 * balance, masked payout method, fees, withholding, amounts and blockers. Matures due commissions first.
 */
export async function GET(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.payout.preview",
    prepare: async ({ now }) => {
      const period = assertClosedPeriod(new URL(request.url).searchParams.get("period") ?? "", now);
      return { resource: `affiliate:payout_period:${period}`, args: { period }, period };
    },
    run: async ({ db, now }, { period }) => ok(await previewPayouts(db, period, now)),
  });
}
