/** Valid policy page slugs — shared between sidebar, index, and dynamic route */
export const POLICY_SLUGS = [
  'overview',
  'ship-policy',
  'contributor-policy',
  'membership-tiers',
  'onboarding',
  'violations',
] as const;

export type PolicySlug = (typeof POLICY_SLUGS)[number];
