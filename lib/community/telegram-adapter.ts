import { createTelegramClient, getTelegramConfig, type TelegramChatMember } from "./telegram-api";
import { ProviderError, type ApplyResult, type CommunityAdapter } from "./types";

/**
 * Removal is a short ban followed by an unban. Telegram treats an `until_date` under 30 seconds away
 * as a permanent ban, so the ban lasts a minute: if the unban call fails, it still expires.
 */
const REMOVAL_BAN_SECONDS = 60;

function isInChat(member: TelegramChatMember): boolean {
  if (member.status === "restricted") return member.is_member === true;
  return member.status === "creator" || member.status === "administrator" || member.status === "member";
}

const isChatAdmin = (member: TelegramChatMember) => member.status === "creator" || member.status === "administrator";

/**
 * One shared community supergroup for Premium and VIP. Entitled linked users are let in through
 * join requests (approved by the webhook); this adapter reports whether they are in, and removes
 * linked users whose membership ended. Admins and the owner are never touched.
 */
export const telegramAdapter: CommunityAdapter = {
  target: "telegram_group",
  provider: "telegram",
  async apply({ desiredTier, connection }): Promise<ApplyResult> {
    if (!connection) return { status: "not_connected", appliedTier: "none" };
    const config = getTelegramConfig();
    if (!config) return { status: "action_required", appliedTier: "none", errorCode: "telegram_not_configured" };

    const client = createTelegramClient(config.botToken);
    const telegramUserId = connection.externalUserId;
    let member: TelegramChatMember;
    try {
      member = await client.getChatMember(config.groupChatId, telegramUserId);
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      if (error.code === "telegram_user_not_found") member = { status: "left" };
      else if (error.retryable) throw error;
      else return { status: "action_required", appliedTier: "none", errorCode: error.code };
    }

    if (desiredTier !== "none") {
      return isInChat(member)
        ? { status: "active", appliedTier: desiredTier }
        : { status: "waiting_for_join", appliedTier: "none" };
    }

    if (isChatAdmin(member)) {
      return { status: "action_required", appliedTier: "none", errorCode: "telegram_admin_not_removed" };
    }
    if (!isInChat(member)) return { status: "revoked", appliedTier: "none" };

    try {
      await client.banChatMember(config.groupChatId, telegramUserId, Math.floor(Date.now() / 1000) + REMOVAL_BAN_SECONDS);
      await client.unbanChatMember(config.groupChatId, telegramUserId);
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) {
        return { status: "action_required", appliedTier: "none", errorCode: error.code };
      }
      throw error;
    }
    return { status: "revoked", appliedTier: "none" };
  },
};
