/**
 * Sumsub webhook: identity verification decisions for Vietnamese bank payees. The signature over the
 * raw body is verified before anything is parsed; only the applicant reference, status and decision
 * labels are stored. 404 while `AFFILIATE_EKYC_ENABLED` is off or the provider is not configured.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { applyVerificationDecision } from "@/lib/referrals/affiliate-verification";
import { EkycSignatureError } from "@/lib/referrals/ekyc/ekyc-provider";
import { sumsubFromEnv } from "@/lib/referrals/ekyc/sumsub-provider";
import { isAffiliateEkycEnabled } from "@/lib/referrals/referral-env";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const provider = isAffiliateEkycEnabled() ? sumsubFromEnv() : null;
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try {
    const decision = await provider.parseWebhook(rawBody, request.headers);
    if (decision) await applyVerificationDecision(getDb(), provider.name, decision);
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof EkycSignatureError) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    console.error("eKYC webhook failed", { error: error instanceof Error ? error.message : "unknown" });
    // Non-2xx so the provider retries; the update is idempotent.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
