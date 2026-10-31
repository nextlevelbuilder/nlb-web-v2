import { ok } from "@/lib/builder-league/http";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { createPayoutBatch, listPayoutBatches } from "@/lib/referrals/affiliate-payouts";
import { payoutBatchDetailView, payoutBatchView } from "@/lib/referrals/affiliate-read-models";
import { AFFILIATE_OPERATOR_RESOURCE, runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { batchCreateSchema } from "@/lib/referrals/http/affiliate-operator-schemas";
import { parseBoundedInt } from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/** Payout batches, newest period first (`?limit=` default 24, max 120). */
export async function GET(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.payout.batch.list",
    prepare: async () => {
      const limit = parseBoundedInt(new URL(request.url).searchParams.get("limit"), "limit", 24, 120);
      return { resource: AFFILIATE_OPERATOR_RESOURCE, args: { limit }, limit };
    },
    run: async ({ db }, { limit }) => ok({ batches: (await listPayoutBatches(db, limit)).map(payoutBatchView) }),
  });
}

/**
 * Create the draft batch of a closed month (`{ period: "YYYY-MM" }`, one batch per period). Every
 * payable line's gross amount is locked in the ledger (`available -> payout_locked`). A second
 * operator then approves it (`/batches/{id}/approve`) before payments are recorded.
 */
export async function POST(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.payout.batch.create",
    prepare: async () => {
      const { period } = batchCreateSchema.parse((await readJsonObject(request)).body);
      return { resource: `affiliate:payout_period:${period}`, args: { period }, period };
    },
    run: async ({ db, now }, { period }, grant) => {
      const { batch, items } = await createPayoutBatch(db, period, grant.actorUserId, now);
      return ok(payoutBatchDetailView(batch, items), undefined, 201);
    },
  });
}
