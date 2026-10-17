import { describe, it, expect } from "vitest";
import { isPrivateIp } from "@/lib/moderation/safe-fetch";
import { screenListingWithAi } from "@/lib/moderation/ai";

describe("Moderation Automated Checks & SSRF Protection", () => {
  it("should identify and reject private, loopback, and cloud metadata IPs", () => {
    // Loopback
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("127.0.0.254")).toBe(true);
    // RFC 1918 Private
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    // Cloud Metadata / Link-local
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    // IPv6 Loopback / Local
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });

  it("should allow valid public IP addresses", () => {
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("104.21.45.12")).toBe(false);
  });

  it("should flag prohibited topics and brief descriptions during advisory AI screening", async () => {
    const report = await screenListingWithAi({
      title: "Fast Casino",
      tagline: "Win crypto games",
      description: "A fun casino game platform with gambling.",
      websiteUrl: "https://casino-example.com",
    });

    expect(report.isClean).toBe(false);
    expect(report.flags.some((f) => f.includes("prohibited_topic:casino"))).toBe(true);
  });

  it("should mark clean listings as verified advisory candidates", async () => {
    const report = await screenListingWithAi({
      title: "CodePilot",
      tagline: "AI Code Analysis for Developers",
      description: "CodePilot accelerates code reviews by detecting syntax and logic errors in pull requests automatically.",
      websiteUrl: "https://codepilot.dev",
    });

    expect(report.isClean).toBe(true);
    expect(report.suggestedTags).toContain("ai-tools");
    expect(report.suggestedTags).toContain("developer-tools");
  });
});
