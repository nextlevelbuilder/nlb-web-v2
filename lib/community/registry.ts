import { discordAdapter } from "./discord-adapter";
import { telegramAdapter } from "./telegram-adapter";
import type { CommunityAdapter, CommunityTarget } from "./types";

const ADAPTERS: Readonly<Record<CommunityTarget, CommunityAdapter>> = {
  discord_guild: discordAdapter,
  telegram_group: telegramAdapter,
};

export function getCommunityAdapter(target: CommunityTarget): CommunityAdapter {
  return ADAPTERS[target];
}
