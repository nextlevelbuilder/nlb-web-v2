import { describe, it, expect } from "vitest";
import { validateOfferProcessor } from "@/lib/domain/offers";

describe("Dormant Commerce Kernel & Processor Firewall", () => {
  it("should allow valid processors for standard community subscriptions", () => {
    expect(validateOfferProcessor("community-monthly", "polar")).toBe(true);
    expect(validateOfferProcessor("community-yearly", "polar")).toBe(true);
    expect(validateOfferProcessor("community-monthly", "invoice")).toBe(true);
  });

  it("should reject Polar processor for restricted promotional directory offers under AUP", () => {
    // Under Polar AUP, advertising/sponsorship and directory promo placements cannot use Polar
    expect(validateOfferProcessor("featured-listing", "polar")).toBe(false);
    expect(validateOfferProcessor("category-sponsor", "polar")).toBe(false);
    expect(validateOfferProcessor("newsletter-placement", "polar")).toBe(false);
    expect(validateOfferProcessor("ltd-deal", "polar")).toBe(false);
    expect(validateOfferProcessor("homepage-feature", "polar")).toBe(false);
    expect(validateOfferProcessor("sponsored-slot", "polar")).toBe(false);
    expect(validateOfferProcessor("guaranteed-traffic", "polar")).toBe(false);
    expect(validateOfferProcessor("paid-article", "polar")).toBe(false);
  });

  it("should enforce category-based allowlist for Polar processor", () => {
    // Allowed categories
    expect(validateOfferProcessor("workshop-library", "polar", "digital_content")).toBe(true);
    expect(validateOfferProcessor("studio-toolkit", "polar", "tooling")).toBe(true);
    expect(validateOfferProcessor("launch-teardown", "polar", "advisory")).toBe(true);
    expect(validateOfferProcessor("discord-channel", "polar", "community_ancillary")).toBe(true);

    // Categorically blocked promotional categories
    expect(validateOfferProcessor("custom-promo", "polar", "promotion")).toBe(false);
    expect(validateOfferProcessor("top-placement", "polar", "placement")).toBe(false);
    expect(validateOfferProcessor("brand-sponsor", "polar", "sponsorship")).toBe(false);
    expect(validateOfferProcessor("traffic-boost", "polar", "traffic")).toBe(false);
  });

  it("should allow invoice/manual processors for restricted promotional offers", () => {
    expect(validateOfferProcessor("featured-listing", "invoice")).toBe(true);
    expect(validateOfferProcessor("featured-listing", "manual")).toBe(true);
    expect(validateOfferProcessor("category-sponsor", "invoice")).toBe(true);
  });
});
