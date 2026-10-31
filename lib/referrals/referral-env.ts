import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Runtime vars the affiliate program reads. All optional: callers fail closed. */
export type ReferralEnvKey = "AFFILIATES_ENABLED" | "AFFILIATE_PAYOUTS_ENABLED";

/** Reads a binding from the OpenNext Cloudflare context, falling back to `process.env` (cron, scripts, vitest). */
export function getReferralBinding(name: ReferralEnvKey): string | undefined {
  try {
    const value = (getCloudflareContext().env as unknown as Record<string, string | undefined>)[name];
    if (value !== undefined) return value;
  } catch {
    // No OpenNext request context.
  }
  return process.env[name];
}

/**
 * `AFFILIATES_ENABLED` gates every member and public surface (404 while off) and checkout
 * attribution. Operator APIs stay usable so rules can be prepared before launch.
 */
export function isAffiliatesEnabled(): boolean {
  return getReferralBinding("AFFILIATES_ENABLED") === "true";
}

/**
 * `AFFILIATE_PAYOUTS_ENABLED` gates recording a payout as paid. It stays off until the legal and
 * finance review in docs/affiliate-program-adr.md is signed off; previews and approvals still work.
 */
export function isAffiliatePayoutsEnabled(): boolean {
  return getReferralBinding("AFFILIATE_PAYOUTS_ENABLED") === "true";
}

/** Browsers that send Global Privacy Control or Do Not Track get no passive attribution or click counting. */
export function optedOutOfTracking(request: Request): boolean {
  return request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1";
}
