import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { getProgram } from "@/lib/referrals/affiliate-read-models";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import { assertAffiliatesEnabled } from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/** The published program: levels, budgets, eligible plans, attribution window, hold, payout fees. Public. */
export async function GET() {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    return ok(await getProgram(getDb()));
  });
}
