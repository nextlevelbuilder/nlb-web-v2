import { ok } from "@/lib/builder-league/http";
import { listConversionsForOperators } from "@/lib/referrals/affiliate-read-models";
import { referralInvalid } from "@/lib/referrals/referral-errors";
import type { AffiliateConversionStatus } from "@/lib/referrals/types";
import { AFFILIATE_OPERATOR_RESOURCE, runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { parseBoundedInt } from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

const STATUSES: readonly AffiliateConversionStatus[] = ["pending", "available", "held", "reversed"];

/** Conversions across the program, newest first. `?status=pending|available|held|reversed`, `?limit=` max 200. */
export async function GET(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.conversion.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const raw = query.get("status")?.trim() || null;
      if (raw !== null && !STATUSES.includes(raw as AffiliateConversionStatus)) throw referralInvalid(`status must be one of ${STATUSES.join(", ")}`);
      const filter = { status: (raw ?? undefined) as AffiliateConversionStatus | undefined, limit: parseBoundedInt(query.get("limit"), "limit", 50, 200) };
      return { resource: AFFILIATE_OPERATOR_RESOURCE, args: filter, filter };
    },
    run: async ({ db }, { filter }) => ok({ conversions: await listConversionsForOperators(db, filter) }),
  });
}
