import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { readJsonObject, withLiveIdempotency } from "@/lib/live/http/live-request-context";
import { enrollAffiliate } from "@/lib/referrals/affiliates";
import { affiliateSummary } from "@/lib/referrals/affiliate-read-models";
import { enrollSchema } from "@/lib/referrals/http/affiliate-member-schemas";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import { assertAffiliatesEnabled, requireAffiliateCaller, requireEnrolledAffiliate } from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/** The caller's affiliate account: status, level, budget, balances and masked payout method. 404 `not_enrolled`. */
export async function GET(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const now = new Date();
    const { userId } = await requireAffiliateCaller(request, db);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    return ok(await affiliateSummary(db, affiliate, now));
  });
}

/**
 * Join the program by accepting the current Affiliate Agreement version (`termsVersion`). Verified,
 * non-banned accounts only. Supports `Idempotency-Key`; a second join is 409 `already_enrolled`.
 */
export async function POST(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const now = new Date();
    const { userId } = await requireAffiliateCaller(request, db);
    const { text, body } = await readJsonObject(request);
    const input = enrollSchema.parse(body);
    return withLiveIdempotency(request, db, userId, text, async () => {
      const affiliate = await enrollAffiliate(db, userId, input, now);
      return ok(await affiliateSummary(db, affiliate, now), undefined, 201);
    });
  });
}
