import { ok } from "@/lib/builder-league/http";
import { reconciliationReport } from "@/lib/referrals/affiliate-read-models";
import { referralInvalid } from "@/lib/referrals/referral-errors";
import { AFFILIATE_OPERATOR_RESOURCE, runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";

export const dynamic = "force-dynamic";

function parseInstant(value: string | null, name: string): Date | undefined {
  if (value === null || value.trim() === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw referralInvalid(`${name} must be an ISO 8601 date or date-time`);
  return date;
}

/**
 * Ledger-to-provider reconciliation for conversions paid in `[since, until)` (ISO 8601, both optional):
 * per conversion amounts with issues, ledger bucket totals and program-wide checks.
 */
export async function GET(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.reconciliation.read",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const range = { since: parseInstant(query.get("since"), "since"), until: parseInstant(query.get("until"), "until") };
      if (range.since && range.until && range.since >= range.until) throw referralInvalid("since must be before until");
      return { resource: AFFILIATE_OPERATOR_RESOURCE, args: { since: range.since?.toISOString() ?? null, until: range.until?.toISOString() ?? null }, range };
    },
    run: async ({ db }, { range }) => ok(await reconciliationReport(db, range)),
  });
}
