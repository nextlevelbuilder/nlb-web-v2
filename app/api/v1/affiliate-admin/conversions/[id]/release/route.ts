import { ok } from "@/lib/builder-league/http";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { releaseConversion } from "@/lib/referrals/affiliate-conversions";
import { operatorConversionView } from "@/lib/referrals/affiliate-read-models";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { emptySchema } from "@/lib/referrals/http/affiliate-operator-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Release a held conversion back to `pending`; it matures on its original schedule. */
export async function POST(request: Request, { params }: Params) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.conversion.release",
    prepare: async () => {
      const conversionId = requirePathParam((await params).id, "id");
      emptySchema.parse((await readJsonObject(request)).body);
      return { resource: `affiliate:conversion:${conversionId}`, args: { conversionId }, conversionId };
    },
    run: async ({ db, now }, { conversionId }, grant) =>
      ok(operatorConversionView(await releaseConversion(db, conversionId, { actorUserId: grant.actorUserId }, now))),
  });
}
