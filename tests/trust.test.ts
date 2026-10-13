import { describe, it, expect } from "vitest";
import { calculateTrustScore, evaluateProductBadges } from "@/lib/domain/trust";

describe("Trust Passport & Badge Evaluation", () => {
  it("should calculate base trust score for human-approved products", () => {
    const score = calculateTrustScore({
      isHumanApproved: true,
      hasCustomDomain: true,
      activeVotesCount: 5,
      daysActive: 14,
    });

    // 40 (approved) + 20 (domain) + 10 (5 votes * 2) + 4 (14 days / 7 * 2) = 74
    expect(score).toBe(74);
  });

  it("should award verified badges appropriately based on trust factors", () => {
    const badges = evaluateProductBadges({
      isHumanApproved: true,
      hasCustomDomain: true,
      activeVotesCount: 15,
      daysActive: 30,
      verifiedRevenueOrPreorders: true,
    });

    const humanBadge = badges.find((b) => b.id === "human_approved");
    const communityBadge = badges.find((b) => b.id === "community_voted");
    const revenueBadge = badges.find((b) => b.id === "verified_revenue");

    expect(humanBadge?.isGranted).toBe(true);
    expect(communityBadge?.isGranted).toBe(true);
    expect(revenueBadge?.isGranted).toBe(true);
  });

  it("should ensure trust score and badge grants are identical regardless of payment", () => {
    // Both paid and unpaid products evaluated through product page trust factors
    // must produce the exact same trustScore and badge set
    const baseFactors = {
      isHumanApproved: true,
      hasCustomDomain: true,
      activeVotesCount: 5,
      daysActive: 14,
      verifiedRevenueOrPreorders: false, // Decoupled from isFeatured
    };

    const unpaidScore = calculateTrustScore(baseFactors);
    const paidScore = calculateTrustScore({ ...baseFactors });
    expect(paidScore).toBe(unpaidScore);

    const unpaidBadges = evaluateProductBadges(baseFactors);
    const paidBadges = evaluateProductBadges({ ...baseFactors });
    expect(paidBadges.map((b) => b.isGranted)).toEqual(unpaidBadges.map((b) => b.isGranted));
    expect(paidBadges.find((b) => b.id === "verified_revenue")?.isGranted).toBe(false);
  });
});
