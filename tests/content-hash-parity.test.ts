import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { computeContentHash, computeContentHashSync, ProductDocumentSchema } from "@/packages/contracts/src";
import { LAYOUT_TEMPLATES } from "@/packages/contracts/src/templates";

// The hash the web computed with node:crypto before the contracts merged. Stored revisions depend on it.
function legacyHash(value: unknown): string {
  const canonicalize = (val: unknown): unknown => {
    if (val === null || typeof val !== "object") return val;
    if (Array.isArray(val)) return val.map(canonicalize);
    const obj = val as Record<string, unknown>;
    return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, canonicalize(obj[key])]));
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

describe("content hash parity", () => {
  const meta = { title: "Ünïcode Launch 🚀", tagline: "Fast & \"quoted\"", websiteUrl: "https://example.com", screenshotUrl: "https://cdn.example.com/a.png" };
  const documents = LAYOUT_TEMPLATES.map((template) => ProductDocumentSchema.parse({
    title: meta.title,
    tagline: meta.tagline,
    description: "A long enough description with numbers 1.5, 0, -3 and 1e21.",
    websiteUrl: meta.websiteUrl,
    categorySlugs: ["saas"],
    tagSlugs: ["edge", "mcp"],
    blocks: template.generateBlocks(meta),
  }));

  it("matches the legacy node:crypto hash for every template document", async () => {
    for (const doc of documents) {
      expect(computeContentHashSync(doc)).toBe(legacyHash(doc));
      expect(await computeContentHash(doc)).toBe(legacyHash(doc));
    }
  });

  it("drops undefined object keys like JSON.stringify", () => {
    const doc = { ...documents[0], logoUrl: undefined };
    expect(computeContentHashSync(doc)).toBe(legacyHash(doc));
  });
});
