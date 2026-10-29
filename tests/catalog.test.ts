import { describe, it, expect } from "vitest";
import { computeContentHashSync, ProductDocumentSchema, type ProductDocument } from "@nextlevelbuilder/contracts";

describe("Catalog Contracts & Canonical Hash Computation", () => {
  it("should generate identical content hashes regardless of object key order", () => {
    const doc1: ProductDocument = {
      schemaVersion: 1,
      title: "Alpha Bot",
      tagline: "Autonomous Trading Assistant",
      description: "AI-powered automated trading bot for solopreneurs.",
      websiteUrl: "https://alphabot.io",
      categorySlugs: ["ai-tools", "developer-tools"],
      tagSlugs: ["trading", "ai"],
      blocks: [
        {
          id: "hero-1",
          type: "hero",
          props: {
            headline: "Build Faster with Alpha",
            subheadline: "The modern AI toolkit",
          },
        },
      ],
    };

    // Construct doc2 with different property insertion order
    const doc2: ProductDocument = {
      description: "AI-powered automated trading bot for solopreneurs.",
      websiteUrl: "https://alphabot.io",
      tagline: "Autonomous Trading Assistant",
      schemaVersion: 1,
      title: "Alpha Bot",
      blocks: [
        {
          type: "hero",
          props: {
            subheadline: "The modern AI toolkit",
            headline: "Build Faster with Alpha",
          },
          id: "hero-1",
        },
      ],
      tagSlugs: ["trading", "ai"],
      categorySlugs: ["ai-tools", "developer-tools"],
    };

    const hash1 = computeContentHashSync(doc1);
    const hash2 = computeContentHashSync(doc2);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex string
  });

  it("should validate valid product documents against ProductDocumentSchema", () => {
    const validDoc = {
      schemaVersion: 1,
      title: "DevFlow",
      tagline: "Continuous Delivery for Solo Founders",
      description: "Automate your deployments in under five minutes with zero hassle.",
      websiteUrl: "https://devflow.app",
      categorySlugs: ["developer-tools"],
      tagSlugs: ["ci-cd", "devops"],
      blocks: [
        {
          id: "grid-1",
          type: "grid",
          props: {
            columns: 2,
            items: [
              { title: "Fast", description: "Deploys in seconds" },
              { title: "Secure", description: "Encrypted secrets" },
            ],
          },
        },
      ],
    };

    const parsed = ProductDocumentSchema.parse(validDoc);
    expect(parsed.title).toBe("DevFlow");
    expect(parsed.blocks.length).toBe(1);
  });

  it("should fail validation on invalid block types or invalid website URLs", () => {
    const invalidDoc = {
      schemaVersion: 1,
      title: "Bad App",
      tagline: "Invalid Website",
      description: "Testing schema rejection.",
      websiteUrl: "not-a-valid-url",
      categorySlugs: ["ai-tools"],
      blocks: [
        {
          id: "unknown-1",
          type: "unsupported_block_type",
          props: {},
        },
      ],
    };

    expect(() => ProductDocumentSchema.parse(invalidDoc)).toThrow();
  });
});
