import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { findVerification, startVerification, verificationView } from "@/lib/referrals/affiliate-verification";
import { sumsubFromEnv } from "@/lib/referrals/ekyc/sumsub-provider";
import { verificationStartSchema } from "@/lib/referrals/http/affiliate-member-schemas";
import { withReferralErrors } from "@/lib/referrals/http/referral-http-errors";
import {
  assertAffiliatesEnabled,
  assertSessionCaller,
  requireAffiliateCaller,
  requireEnrolledAffiliate,
} from "@/lib/referrals/http/referral-request-context";

export const dynamic = "force-dynamic";

/** The caller's identity verification status (`not_started` when none). Never the provider reference or any document data. */
export async function GET(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const { userId } = await requireAffiliateCaller(request, db);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    return ok(verificationView(await findVerification(db, affiliate.id)));
  });
}

/**
 * Start or resume identity verification for a Vietnamese bank payout. Returns a short-lived link to
 * the provider's hosted flow (`url`, null once verified); documents go to the provider, never to NLB.
 * Session only, same-site. 503 `verification_unavailable` while eKYC is not enabled.
 */
export async function POST(request: Request) {
  return withReferralErrors(async () => {
    assertAffiliatesEnabled();
    const db = getDb();
    const { caller, userId } = await requireAffiliateCaller(request, db);
    assertSessionCaller(caller);
    const { locale } = verificationStartSchema.parse((await readJsonObject(request)).body);
    const affiliate = await requireEnrolledAffiliate(db, userId);
    return ok(await startVerification(db, sumsubFromEnv(), affiliate, { locale: locale ?? "en" }));
  });
}
