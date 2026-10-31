import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { readJsonObject, withLiveIdempotency } from "@/lib/live/http/live-request-context";
import { requireActiveAffiliate } from "@/lib/referrals/affiliates";
import { createLink } from "@/lib/referrals/affiliate-links";
import { getLinkView, listLinkViews } from "@/lib/referrals/affiliate-read-models";
import { linkCreateSchema } from "@/lib/referrals/http/affiliate-member-schemas";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import {
  assertAffiliatesEnabled,
  publicOrigin,
  requireAffiliateCaller,
  requireEnrolledAffiliate,
} from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/** The caller's links, newest first, with today's commission, unique clicks and conversions. */
export async function GET(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const { userId } = await requireAffiliateCaller(request, db);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    return ok({ links: await listLinkViews(db, affiliate, publicOrigin(request)) });
  });
}

/**
 * Create a link. `code` is optional (generated when omitted); `discountBps` must fit the caller's
 * current incentive budget (422 `over_budget`). Active affiliates only. Supports `Idempotency-Key`.
 */
export async function POST(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const now = new Date();
    const { userId } = await requireAffiliateCaller(request, db);
    const { text, body } = await readJsonObject(request);
    const input = linkCreateSchema.parse(body);
    const affiliate = await requireActiveAffiliate(db, userId);
    return withLiveIdempotency(request, db, userId, text, async () => {
      const link = await createLink(db, affiliate, input, now);
      return ok(await getLinkView(db, affiliate, link, publicOrigin(request), now), undefined, 201);
    });
  });
}
