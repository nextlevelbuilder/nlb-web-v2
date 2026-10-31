import { getDb } from "@/lib/db";
import { BuilderApiError, ok } from "@/lib/builder-league/http";
import { affiliateStanding } from "@/lib/referrals/affiliates";
import { maxCommissionBps, previewIncentive } from "@/lib/referrals/program-math";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import { assertAffiliatesEnabled, requireAffiliateCaller, requireEnrolledAffiliate } from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

function queryInt(value: string | null, name: string, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) throw new BuilderApiError(400, "invalid_input", `${name} must be an integer 0-${max}`);
  return parsed;
}

/**
 * What a buyer discount (`discountBps`) leaves as commission under the caller's current budget, and,
 * with `priceMinor`, an indicative example of what the buyer pays, the affiliate earns and NLB keeps.
 * A discount above the budget is reported with `withinBudget: false` and no commission.
 */
export async function GET(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const now = new Date();
    const query = new URL(request.url).searchParams;
    const discountBps = queryInt(query.get("discountBps"), "discountBps", 9000);
    if (discountBps === null) throw new BuilderApiError(400, "invalid_input", "discountBps is required");
    const priceMinor = queryInt(query.get("priceMinor"), "priceMinor", 100_000_000);
    const { userId } = await requireAffiliateCaller(request, db);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    const { budgetBps } = await affiliateStanding(db, affiliate, now);
    const withinBudget = discountBps <= budgetBps;
    const commissionBps = withinBudget ? maxCommissionBps(discountBps, budgetBps) : 0;
    return ok({
      budgetBps,
      discountBps,
      commissionBps,
      withinBudget,
      ...(priceMinor !== null && withinBudget ? { example: previewIncentive(priceMinor, discountBps, commissionBps) } : {}),
    });
  });
}
