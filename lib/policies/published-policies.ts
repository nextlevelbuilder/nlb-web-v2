/**
 * Server-only view of which policy pages are public. Launch-gated policies (the Affiliate Agreement)
 * appear on their page, the index, the sidebar, the sitemap and the Markdown/LLM surfaces only while
 * `AFFILIATES_ENABLED` is on.
 */
import { LAUNCH_GATED_POLICY_SLUGS, POLICY_PAGE_SLUGS, type PolicyPageSlug } from "@/content/policies";
import { isAffiliatesEnabled } from "@/lib/referrals/referral-env";

export function isPolicyPublished(slug: PolicyPageSlug): boolean {
  return !LAUNCH_GATED_POLICY_SLUGS.includes(slug) || isAffiliatesEnabled();
}

export function publishedPolicySlugs(): PolicyPageSlug[] {
  return POLICY_PAGE_SLUGS.filter(isPolicyPublished);
}
