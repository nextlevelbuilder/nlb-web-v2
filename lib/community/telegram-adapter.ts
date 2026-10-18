import { createTelegramClient, getTelegramConfig, type TelegramChatMember, type TelegramClient } from "./telegram-api";
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

/** Remove a member with a short ban then an unban, so they can rejoin later. */
async function kick(client: TelegramClient, groupChatId: string, telegramUserId: string): Promise<void> {
  await client.banChatMember(groupChatId, telegramUserId, Math.floor(Date.now() / 1000) + REMOVAL_BAN_SECONDS);
  await client.unbanChatMember(groupChatId, telegramUserId);
}

/**
 * Remove an account from the group right away, outside the reconcile job (for example an approval
 * that raced an unlink). Admins and the owner are never touched. Throws `ProviderError` on failure.
 */
export async function removeFromTelegramGroup(
  client: TelegramClient,
  groupChatId: string,
  telegramUserId: string
): Promise<"removed" | "not_in_chat" | "admin"> {
  let member: TelegramChatMember;
  try {
    member = await client.getChatMember(groupChatId, telegramUserId);
  } catch (error) {
    if (!(error instanceof ProviderError) || error.code !== "telegram_user_not_found") throw error;
    return "not_in_chat";
  }
  if (isChatAdmin(member)) return "admin";
  if (!isInChat(member)) return "not_in_chat";
  await kick(client, groupChatId, telegramUserId);
  return "removed";
}

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
      await kick(client, config.groupChatId, telegramUserId);
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) {
        return { status: "action_required", appliedTier: "none", errorCode: error.code };
      }
      throw error;
    }
    return { status: "revoked", appliedTier: "none" };
  },
};
