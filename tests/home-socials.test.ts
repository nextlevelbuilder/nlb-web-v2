import { describe, expect, it } from "vitest";
import { DISCORD_INVITE_URL, SOCIAL_LINKS, resolveDiscordInvite } from "@/lib/constants/socials";

describe("social links", () => {
  it("exposes the canonical community links and no YouTube", () => {
    expect(SOCIAL_LINKS).toEqual({
      discord: "https://discord.com/invite/Ht4sb7Wjnx",
      x: "https://x.com/nextlevelbuilders",
      linkedin: "https://www.linkedin.com/company/nextlevelbuilders",
      github: "https://github.com/nextlevelbuilder",
    });
  });
});

describe("resolveDiscordInvite", () => {
  it("replaces dead, placeholder and missing invites with the canonical one", () => {
    expect(resolveDiscordInvite("https://discord.gg/nextlevelbuilder")).toBe(DISCORD_INVITE_URL);
    expect(resolveDiscordInvite("https://discord.gg/example/")).toBe(DISCORD_INVITE_URL);
    expect(resolveDiscordInvite("")).toBe(DISCORD_INVITE_URL);
    expect(resolveDiscordInvite(undefined)).toBe(DISCORD_INVITE_URL);
  });

  it("rejects non-https and non-Discord URLs", () => {
    expect(resolveDiscordInvite("http://discord.gg/abc")).toBe(DISCORD_INVITE_URL);
    expect(resolveDiscordInvite("https://evil.example/discord")).toBe(DISCORD_INVITE_URL);
    expect(resolveDiscordInvite("javascript:alert(1)")).toBe(DISCORD_INVITE_URL);
  });

  it("keeps a configured real invite", () => {
    expect(resolveDiscordInvite("https://discord.gg/AbC123")).toBe("https://discord.gg/AbC123");
  });
});
