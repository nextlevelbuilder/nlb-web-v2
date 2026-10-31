import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { readJsonObject, requirePathParam } from "@/lib/live/http/live-request-context";
import { requireActiveAffiliate } from "@/lib/referrals/affiliates";
import { updateLink } from "@/lib/referrals/affiliate-links";
import { getLinkView } from "@/lib/referrals/affiliate-read-models";
import { linkUpdateSchema } from "@/lib/referrals/http/affiliate-member-schemas";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import { assertAffiliatesEnabled, publicOrigin, requireAffiliateCaller } from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Edit one of the caller's links (label, discount, destination, UTM campaign, status). The code never
 * changes; every edit bumps `version`, and `expectedVersion` turns a concurrent edit into a 409. A link
 * of another affiliate is 404. A discount above the current budget is 422 `over_budget`.
 */
export async function PATCH(request: Request, { params }: Params) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const linkId = requirePathParam((await params).id, "id");
    const db = getDb();
    const now = new Date();
    const { userId } = await requireAffiliateCaller(request, db);
    const input = linkUpdateSchema.parse((await readJsonObject(request)).body);
    const affiliate = await requireActiveAffiliate(db, userId);
    const link = await updateLink(db, affiliate, linkId, input, now);
    return ok(await getLinkView(db, affiliate, link, publicOrigin(request), now));
  });
}
