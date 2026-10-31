import { ok } from "@/lib/builder-league/http";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { holdConversion } from "@/lib/referrals/affiliate-conversions";
import { operatorConversionView } from "@/lib/referrals/affiliate-read-models";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { reasonSchema } from "@/lib/referrals/http/affiliate-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Freeze a pending conversion for review (suspected fraud, dispute); its commission moves to `held`. */
export async function POST(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.conversion.hold",
    prepare: async () => {
      const conversionId = requirePathParam((await params).id, "id");
      const { reason } = reasonSchema.parse((await readJsonObject(request)).body);
      return { resource: `affiliate:conversion:${conversionId}`, args: { conversionId, reason }, conversionId, reason };
    },
    run: async ({ db, now }, { conversionId, reason }, grant) =>
      ok(operatorConversionView(await holdConversion(db, conversionId, { reason, actorUserId: grant.actorUserId }, now))),
  });
}
