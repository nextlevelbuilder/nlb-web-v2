import { ok } from "@/lib/builder-league/http";
import { listAffiliatesForOperators } from "@/lib/referrals/affiliate-read-models";
import { referralInvalid } from "@/lib/referrals/referral-errors";
import type { AffiliateStatus } from "@/lib/referrals/types";
import { AFFILIATE_OPERATOR_RESOURCE, runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { parseBoundedInt } from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

const STATUSES: readonly AffiliateStatus[] = ["active", "suspended"];

/** Affiliate accounts, newest first, with level, budget and balances. `?status=active|suspended`, `?limit=` max 200. */
export async function GET(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.affiliate.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const raw = query.get("status")?.trim() || null;
      if (raw !== null && !STATUSES.includes(raw as AffiliateStatus)) throw referralInvalid("status must be active or suspended");
      const filter = { status: (raw ?? undefined) as AffiliateStatus | undefined, limit: parseBoundedInt(query.get("limit"), "limit", 50, 200) };
      return { resource: AFFILIATE_OPERATOR_RESOURCE, args: filter, filter };
    },
    run: async ({ db, now }, { filter }) => ok({ affiliates: await listAffiliatesForOperators(db, filter, now) }),
  });
}
