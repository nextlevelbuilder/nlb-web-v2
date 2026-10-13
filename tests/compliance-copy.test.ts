import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Polar AUP Compliance Copy Guardrails", () => {
  const rootDir = process.cwd();

  const BANNED_PATTERNS = [
    // Pay-to-feature / Homepage sweepstake
    { pattern: /featured on the homepage/i, name: "featured on the homepage" },
    { pattern: /selected and featured/i, name: "selected and featured" },
    { pattern: /nổi bật trên trang chủ/i, name: "nổi bật trên trang chủ" },

    // Paid promotional articles
    { pattern: /written article promoting/i, name: "written article promoting" },
    { pattern: /promo article/i, name: "promo article" },
    { pattern: /promoting your product/i, name: "promoting your product" },
    { pattern: /bài viết quảng bá/i, name: "bài viết quảng bá" },
    { pattern: /promotional article/i, name: "promotional article" },

    // Guaranteed traffic/exposure claims
    { pattern: /get discovered by thousands/i, name: "get discovered by thousands" },
    { pattern: /Live Directory Traffic/i, name: "Live Directory Traffic" },
    { pattern: /Outbound Referrals/i, name: "Outbound Referrals" },
  ];

  it("should not contain banned promotional or traffic-guarantee phrases in build-with-us client", () => {
    const clientFile = path.join(rootDir, "app/[locale]/build-with-us/build-with-us-client.tsx");
    const content = fs.readFileSync(clientFile, "utf-8");

    for (const { pattern, name } of BANNED_PATTERNS) {
      expect(pattern.test(content), `Found banned phrase '${name}' in build-with-us-client.tsx`).toBe(false);
    }
  });

  it("should not contain banned promotional phrases in messages (en.json and vi.json)", () => {
    const enFile = path.join(rootDir, "messages/en.json");
    const viFile = path.join(rootDir, "messages/vi.json");

    const enContent = fs.readFileSync(enFile, "utf-8");
    const viContent = fs.readFileSync(viFile, "utf-8");

    for (const { pattern, name } of BANNED_PATTERNS) {
      expect(pattern.test(enContent), `Found banned phrase '${name}' in messages/en.json`).toBe(false);
      expect(pattern.test(viContent), `Found banned phrase '${name}' in messages/vi.json`).toBe(false);
    }
  });

  it("should not sell Discord community as standalone product in hero subheadline", () => {
    const enFile = path.join(rootDir, "messages/en.json");
    const enData = JSON.parse(fs.readFileSync(enFile, "utf-8"));

    expect(enData.hero?.subheadline).not.toMatch(/^The Discord community where/i);
  });
});
