import type { CommunityAdapter } from "./types";

/**
 * PLACEHOLDER: replaced by the real Discord guild adapter (OAuth link, `guilds.join`, role sync).
 * Until then it never calls Discord and reports the target as not connected.
 */
export const discordAdapter: CommunityAdapter = {
  target: "discord_guild",
  provider: "discord",
  async apply() {
    return { status: "not_connected", appliedTier: "none" };
  },
};
