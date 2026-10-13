/**
 * Single source of truth for Next Level Builders social links.
 * Every page, email and metadata block must read from here instead of hardcoding URLs.
 */

/** Verified invite for the "Next Level Builder" Discord guild. */
export const DISCORD_INVITE_URL = "https://discord.com/invite/Ht4sb7Wjnx";

/**
 * X handle kept from the previous site. The dewee site uses `nlb_io` instead; the owner has not
 * confirmed which handle is official yet, so this value awaits owner review before launch.
 */
export const X_HANDLE = "nextlevelbuilders";

export const SOCIAL_LINKS = {
  discord: DISCORD_INVITE_URL,
  x: `https://x.com/${X_HANDLE}`,
  linkedin: "https://www.linkedin.com/company/nextlevelbuilders",
  github: "https://github.com/nextlevelbuilder",
} as const;

export type SocialNetwork = keyof typeof SOCIAL_LINKS;

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  discord: "Discord",
  x: "X",
  linkedin: "LinkedIn",
  github: "GitHub",
};

/** Invites that are known to be dead or are configuration placeholders. */
const UNUSABLE_DISCORD_INVITES = new Set([
  "https://discord.gg/nextlevelbuilder",
  "https://discord.gg/example",
]);

/**
 * Return a usable Discord invite: the configured one when it is a real invite,
 * otherwise the canonical community invite.
 */
export function resolveDiscordInvite(candidate?: string | null): string {
  const value = candidate?.trim().replace(/\/+$/, "");
  if (!value || UNUSABLE_DISCORD_INVITES.has(value)) return DISCORD_INVITE_URL;
  try {
    const url = new URL(value);
    const isDiscordHost = ["discord.gg", "discord.com", "www.discord.com"].includes(url.hostname);
    return url.protocol === "https:" && isDiscordHost ? value : DISCORD_INVITE_URL;
  } catch {
    return DISCORD_INVITE_URL;
  }
}
