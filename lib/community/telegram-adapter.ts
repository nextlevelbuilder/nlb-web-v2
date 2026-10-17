import type { CommunityAdapter } from "./types";

/**
 * PLACEHOLDER: replaced by the real Telegram group adapter (deep-link account link, join requests,
 * removal on revoke). Until then it never calls Telegram and reports the target as not connected.
 */
export const telegramAdapter: CommunityAdapter = {
  target: "telegram_group",
  provider: "telegram",
  async apply() {
    return { status: "not_connected", appliedTier: "none" };
  },
};
