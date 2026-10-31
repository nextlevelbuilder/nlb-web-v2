import { affiliateAgreementPolicy } from "./affiliate-agreement";
import { communityOverviewPolicy } from "./community-overview";
import { contributorPolicy } from "./contributor-policy";
import { cookiesPolicy } from "./cookies";
import { membershipTiersPolicy } from "./membership-tiers";
import { onboardingPolicy } from "./onboarding";
import { privacyPolicy } from "./privacy";
import { refundPolicy } from "./refund";
import { shipPolicy } from "./ship-policy";
import { termsPolicy } from "./terms";
import { violationsPolicy } from "./violations";
import type { PolicyDocument, PolicyEntry, PolicyGroup, PolicyLocale } from "./policy-types";

export type { PolicyDocument, PolicyEntry, PolicyGroup, PolicyLocale, PolicySection } from "./policy-types";
export { POLICY_LOCALES } from "./policy-types";

/**
 * Every policy page in display order. `overview` is rendered at `/policies`;
 * every other slug at `/policies/<slug>`.
 */
export const POLICY_PAGE_SLUGS = [
  "overview",
  "ship-policy",
  "contributor-policy",
  "membership-tiers",
  "onboarding",
  "violations",
  "terms",
  "privacy",
  "refund",
  "cookies",
  "affiliate-agreement",
] as const;

export type PolicyPageSlug = (typeof POLICY_PAGE_SLUGS)[number];

export const POLICIES: Record<PolicyPageSlug, PolicyEntry> = {
  overview: communityOverviewPolicy,
  "ship-policy": shipPolicy,
  "contributor-policy": contributorPolicy,
  "membership-tiers": membershipTiersPolicy,
  onboarding: onboardingPolicy,
  violations: violationsPolicy,
  terms: termsPolicy,
  privacy: privacyPolicy,
  refund: refundPolicy,
  cookies: cookiesPolicy,
  "affiliate-agreement": affiliateAgreementPolicy,
};

/** Policies published only once their program launches (the Affiliate Agreement is pending legal review). */
export const LAUNCH_GATED_POLICY_SLUGS: readonly PolicyPageSlug[] = ["affiliate-agreement"];

export function isPolicySlug(value: string): value is PolicyPageSlug {
  return (POLICY_PAGE_SLUGS as readonly string[]).includes(value);
}

/** Falls back to English for any locale other than Vietnamese. */
export function toPolicyLocale(locale: string): PolicyLocale {
  return locale === "vi" ? "vi" : "en";
}

/** Returns the localized document, or null for an unknown slug. */
export function getPolicy(
  slug: string,
  locale: string,
): (PolicyDocument & { slug: PolicyPageSlug; group: PolicyGroup; lastUpdated: string }) | null {
  if (!isPolicySlug(slug)) return null;
  const entry = POLICIES[slug];
  return { ...entry.content[toPolicyLocale(locale)], slug, group: entry.group, lastUpdated: entry.lastUpdated };
}

export function policySlugsByGroup(group: PolicyGroup, published: readonly PolicyPageSlug[] = POLICY_PAGE_SLUGS): PolicyPageSlug[] {
  return published.filter((slug) => POLICIES[slug].group === group);
}

/** Locale-less route of a policy page, ready for the next-intl `Link`. */
export function policyHref(slug: PolicyPageSlug): string {
  return slug === "overview" ? "/policies" : `/policies/${slug}`;
}
