export interface TrustScoreFactors {
  isHumanApproved: boolean;
  hasCustomDomain: boolean;
  activeVotesCount: number;
  daysActive: number;
  verifiedRevenueOrPreorders?: boolean;
}

export interface TrustBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  isGranted: boolean;
}

export const TRUST_POINTS = {
  humanApproval: 40,
  https: 20,
  perVote: 2,
  maxVotes: 20,
  perWeek: 2,
  maxLongevity: 10,
  verifiedTraction: 10,
  maximum: 100,
} as const;

interface ProductTrustInput {
  status: string;
  websiteUrl: string;
  createdAt: string | Date;
  votesCount: number;
}

export function getProductTrustFactors(product: ProductTrustInput, now = Date.now()): TrustScoreFactors {
  const daysActive = Math.max(0, Math.floor((now - new Date(product.createdAt).getTime()) / 86_400_000));
  return {
    isHumanApproved: product.status === "published",
    // This is an HTTPS URL check, not proof of domain ownership.
    hasCustomDomain: product.websiteUrl.startsWith("https://"),
    activeVotesCount: Math.max(0, product.votesCount),
    daysActive,
    verifiedRevenueOrPreorders: false,
  };
}

/** Convert a database row: trust_score is the legacy cumulative vote counter. */
export function projectProductTrust<T extends Omit<ProductTrustInput, "votesCount"> & { trustScore: number }>(
  product: T,
  now = Date.now(),
) {
  const votesCount = product.trustScore;
  return {
    ...product,
    votesCount,
    trustScore: calculateTrustScore(getProductTrustFactors({ ...product, votesCount }, now)),
  };
}

/**
 * Compute an objective trust score based on verifiable factors.
 * Scale: 0 to 100.
 */
export function calculateTrustScore(factors: TrustScoreFactors): number {
  let score = 0;

  // Base human moderation approval: 40 points
  if (factors.isHumanApproved) {
    score += TRUST_POINTS.humanApproval;
  }

  // HTTPS website URL: 20 points
  if (factors.hasCustomDomain) {
    score += TRUST_POINTS.https;
  }

  // Community organic votes (up to 20 points, 2 pts per vote)
  const votePoints = Math.min(Math.max(0, factors.activeVotesCount) * TRUST_POINTS.perVote, TRUST_POINTS.maxVotes);
  score += votePoints;

  // Longevity / days active (up to 10 points)
  const longevityPoints = Math.min(Math.floor(Math.max(0, factors.daysActive) / 7) * TRUST_POINTS.perWeek, TRUST_POINTS.maxLongevity);
  score += longevityPoints;

  // Verified pre-order or revenue proof: 10 points
  // Polar AUP Invariant: Trust factors MUST strictly derive from non-payment evidence.
  // Payment state, order status, or isFeatured MUST NEVER feed verifiedRevenueOrPreorders.
  if (factors.verifiedRevenueOrPreorders) {
    score += TRUST_POINTS.verifiedTraction;
  }

  return Math.min(score, TRUST_POINTS.maximum);
}

/**
 * Get verified badges for a product based on trust factors.
 */
export function evaluateProductBadges(factors: TrustScoreFactors): TrustBadge[] {
  return [
    {
      id: "human_approved",
      name: "Human Verified",
      description: "Reviewed and approved by NLB Management Board",
      icon: "ShieldCheck",
      isGranted: factors.isHumanApproved,
    },
    {
      id: "community_voted",
      name: "Community Backed",
      description: "Received 10+ authentic community votes",
      icon: "ThumbsUp",
      isGranted: factors.activeVotesCount >= 10,
    },
    {
      id: "verified_revenue",
      name: "Verified Traction",
      description: "Confirmed pre-orders or live paying customers",
      icon: "TrendingUp",
      isGranted: !!factors.verifiedRevenueOrPreorders,
    },
  ];
}
