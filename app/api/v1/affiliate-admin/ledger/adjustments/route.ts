import { ok } from "@/lib/builder-league/http";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { adjustAffiliateBalance } from "@/lib/referrals/affiliate-payouts";
import { affiliateBalances } from "@/lib/referrals/commission-ledger";
import { balancesView } from "@/lib/referrals/affiliate-read-models";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { adjustmentSchema } from "@/lib/referrals/http/affiliate-operator-schemas";
import { ledgerAdjustTarget, requireAffiliateExists } from "@/lib/referrals/http/affiliate-sensitive-targets";

export const dynamic = "force-dynamic";

/**
 * Credit (positive) or debit (negative) an affiliate's available balance (sensitive
 * `affiliate.ledger.adjust`): needs an approval for `{ action: "affiliate.ledger.adjust", target:
 * { affiliateId, amountMinor, reason } }` decided by a different operator. The ledger entry is keyed by
 * that approval, so one approval can move money at most once.
 */
export async function POST(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.ledger.adjust",
    prepare: async ({ db }) => {
      const { approvalId, ...input } = adjustmentSchema.parse((await readJsonObject(request)).body);
      await requireAffiliateExists(db, input.affiliateId);
      return { ...ledgerAdjustTarget(input), approvalId, details: { amountMinor: input.amountMinor }, input };
    },
    run: async ({ db }, { input }, grant) => {
      // The guard consumed an approval for this sensitive action, so `grant.approvalId` is set.
      const recorded = await adjustAffiliateBalance(db, {
        affiliateId: input.affiliateId,
        amountMinor: input.amountMinor,
        reason: input.reason,
        actorUserId: grant.actorUserId,
        idempotencyKey: `adjustment:${grant.approvalId}`,
      });
      const balances = balancesView(await affiliateBalances(db, input.affiliateId));
      return ok({ affiliateId: input.affiliateId, amountMinor: input.amountMinor, recorded, balances }, undefined, 201);
    },
  });
}
