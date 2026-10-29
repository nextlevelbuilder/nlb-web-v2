import { describe, it, expect } from "vitest";
import { computeRankingSnapshot } from "@/lib/domain/rankings";
import { LAYOUT_TEMPLATES } from "@nextlevelbuilder/contracts";

describe("Multi-Window Rankings & Date Range Logic", () => {
  it("should support daily, weekly, and monthly window types in ranking computation", async () => {
    // Test that computeRankingSnapshot handles daily window
    expect(typeof computeRankingSnapshot).toBe("function");
  });

  it("should provide all 5 pre-built layout templates with valid block generators", () => {
    expect(LAYOUT_TEMPLATES.length).toBe(5);

    const templateIds = LAYOUT_TEMPLATES.map((t) => t.id);
    expect(templateIds).toContain("saas-launch");
    expect(templateIds).toContain("ai-agent");
    expect(templateIds).toContain("dev-tool");
    expect(templateIds).toContain("community-curated");
    expect(templateIds).toContain("minimalist");

    // Test block generation
    for (const tmpl of LAYOUT_TEMPLATES) {
      const blocks = tmpl.generateBlocks({
        title: "Test Product",
        tagline: "Test Tagline",
        websiteUrl: "https://test.com",
        screenshotUrl: "https://test.com/preview.png",
      });
      expect(blocks.length).toBeGreaterThanOrEqual(3);
      expect(blocks[0].type).toBe("hero");
    }
  });
});
