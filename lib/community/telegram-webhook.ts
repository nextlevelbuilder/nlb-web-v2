import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { communityConnections } from "@/lib/db/schema";
import { getMemberTier, isUniqueViolation } from "@/lib/membership/member-access";
import { enqueueAccessReconcile } from "@/lib/onboarding/jobs";
import { consumeNonce } from "@/lib/onboarding/nonces";
import { createTelegramClient, getTelegramConfig } from "./telegram-api";
import { removeFromTelegramGroup } from "./telegram-adapter";
import {
  findTelegramConnectionByTelegramId,
  findTelegramConnectionByUser,
  scheduleOnboardingJobRun,
} from "./telegram-onboarding";
import { ProviderError } from "./types";

/** The subset of a Bot API `Update` this webhook reads. */
export interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number | string; type?: string };
    from?: TelegramUser;
  };
  chat_join_request?: {
    chat?: { id?: number | string };
    from?: TelegramUser;
  };
}

interface TelegramUser {
  id?: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
}

/**
 * The webhook result. `reply` is sent back as a Bot API method in the webhook response body, so
 * answering `/start` needs no extra outbound call. `retry` asks Telegram to redeliver the update.
 */
export type TelegramWebhookOutcome =
  | { kind: "ignored" }
  | { kind: "reply"; chatId: number | string; text: string }
  | { kind: "handled" }
  | { kind: "retry" };

const START_COMMAND = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?\s*$/;
const START_PARAMETER = /^[A-Za-z0-9_-]{1,64}$/;

export const TELEGRAM_REPLIES = {
  linked:
    "✅ Your Telegram account is linked to Next Level Builder. Go back to the site to request access to the community group.\n\n" +
    "✅ Tài khoản Telegram của bạn đã được liên kết với Next Level Builder. Hãy quay lại trang web để yêu cầu tham gia nhóm cộng đồng.",
  invalidLink:
    "This link has expired or was already used. Go back to the site and press “Link Telegram” again.\n\n" +
    "Liên kết này đã hết hạn hoặc đã được sử dụng. Hãy quay lại trang web và bấm “Liên kết Telegram” lần nữa.",
  telegramInUse:
    "This Telegram account is already linked to another Next Level Builder account. Nothing was changed. Contact support if this is unexpected.\n\n" +
    "Tài khoản Telegram này đã được liên kết với một tài khoản Next Level Builder khác. Không có thay đổi nào. Hãy liên hệ hỗ trợ nếu điều này không đúng.",
  accountHasOtherTelegram:
    "Your Next Level Builder account is already linked to a different Telegram account. Unlink it on the site first, then try again.\n\n" +
    "Tài khoản Next Level Builder của bạn đã liên kết với một tài khoản Telegram khác. Hãy hủy liên kết trên trang web trước rồi thử lại.",
} as const;

function displayNameOf(user: TelegramUser): string | null {
  const name = user.username ? `@${user.username}` : user.first_name?.trim();
  return name ? name.slice(0, 64) : null;
}

/**
 * `/start <nonce>` in a private chat: bind this Telegram account to the NLB user who requested the
 * link. Never moves an account between users. Idempotent: a redelivered update whose nonce was
 * already used still answers "linked" when this account is linked to someone.
 */
async function handleStart(db: AppDb, chatId: number | string, from: TelegramUser, parameter: string | undefined, now: Date) {
  const telegramUserId = String(from.id);
  const reply = (text: string): TelegramWebhookOutcome => ({ kind: "reply", chatId, text });

  const consumed = parameter && START_PARAMETER.test(parameter) ? await consumeNonce(db, { kind: "telegram_link", raw: parameter }, now) : null;
  const existing = await findTelegramConnectionByTelegramId(db, telegramUserId);
  if (!consumed) return reply(existing ? TELEGRAM_REPLIES.linked : TELEGRAM_REPLIES.invalidLink);

  const { userId } = consumed;
  if (existing && existing.userId !== userId) return reply(TELEGRAM_REPLIES.telegramInUse);

  const displayName = displayNameOf(from);
  if (existing) {
    await db
      .update(communityConnections)
      .set({ displayName, updatedAt: now })
      .where(eq(communityConnections.id, existing.id));
  } else {
    const ownConnection = await findTelegramConnectionByUser(db, userId);
    if (ownConnection) return reply(TELEGRAM_REPLIES.accountHasOtherTelegram);
    try {
      await db.insert(communityConnections).values({
        userId,
        provider: "telegram",
        externalUserId: telegramUserId,
        displayName,
        linkedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent link won the race: report whichever side of the uniqueness rule it took.
      const winner = await findTelegramConnectionByTelegramId(db, telegramUserId);
      if (winner?.userId !== userId) {
        return reply(winner ? TELEGRAM_REPLIES.telegramInUse : TELEGRAM_REPLIES.accountHasOtherTelegram);
      }
    }
  }

  await enqueueAccessReconcile(db, userId, ["telegram_group"], now);
  scheduleOnboardingJobRun(db);
  return reply(TELEGRAM_REPLIES.linked);
}

/**
 * A join request to the community group from an account linked through NLB: approve it when its
 * owner has an effective paid tier and no pending unlink, decline it otherwise. Requests from
 * accounts not linked through NLB are left untouched, so the group's own admins keep handling them.
 * Reconcile afterwards so the recorded state follows. A request that is already gone (handled
 * earlier) is treated as done. An approval runs outside the reconcile job, so it can race an unlink:
 * when the link is gone, replaced or being unlinked once the approval returns, the account is removed
 * again at once so nothing NLB no longer tracks stays in the group.
 */
async function handleJoinRequest(db: AppDb, groupChatId: string, botToken: string, from: TelegramUser, now: Date) {
  const telegramUserId = String(from.id);
  const connection = await findTelegramConnectionByTelegramId(db, telegramUserId);
  if (!connection) return { kind: "ignored" } as const;
  const entitled = !connection.unlinkRequestedAt && (await getMemberTier(db, connection.userId, now)).tier !== "none";

  const client = createTelegramClient(botToken);
  try {
    if (entitled) await client.approveChatJoinRequest(groupChatId, telegramUserId);
    else await client.declineChatJoinRequest(groupChatId, telegramUserId);
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    console.warn(`telegram join request ${entitled ? "approve" : "decline"} failed: ${error.code}`);
    if (error.retryable) return { kind: "retry" } as const;
  }

  if (entitled) await undoApprovalIfUnlinked(db, client, groupChatId, connection.id, telegramUserId);

  await enqueueAccessReconcile(db, connection.userId, ["telegram_group"], now);
  scheduleOnboardingJobRun(db);
  return { kind: "handled" } as const;
}

async function undoApprovalIfUnlinked(
  db: AppDb,
  client: ReturnType<typeof createTelegramClient>,
  groupChatId: string,
  connectionId: string,
  telegramUserId: string
): Promise<void> {
  const [current] = await db
    .select({ externalUserId: communityConnections.externalUserId, unlinkRequestedAt: communityConnections.unlinkRequestedAt })
    .from(communityConnections)
    .where(eq(communityConnections.id, connectionId))
    .limit(1);
  if (current && current.externalUserId === telegramUserId && !current.unlinkRequestedAt) return;
  try {
    await removeFromTelegramGroup(client, groupChatId, telegramUserId);
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    // Telegram would redeliver the join request, not this removal, so a retry would not help.
    console.error(`telegram removal after an unlinked approval failed: ${error.code}`);
  }
}

/** Route one verified update. Anything outside the bot's private chats and the community group is ignored. */
export async function handleTelegramUpdate(db: AppDb, update: TelegramUpdate, now: Date = new Date()): Promise<TelegramWebhookOutcome> {
  const config = getTelegramConfig();

  const message = update.message;
  if (message?.chat?.type === "private" && typeof message.text === "string" && message.from?.id && !message.from.is_bot) {
    const match = START_COMMAND.exec(message.text.trim());
    if (match && message.chat.id !== undefined) return handleStart(db, message.chat.id, message.from, match[1], now);
    return { kind: "ignored" };
  }

  const joinRequest = update.chat_join_request;
  if (joinRequest?.from?.id && !joinRequest.from.is_bot && config && String(joinRequest.chat?.id) === config.groupChatId) {
    return handleJoinRequest(db, config.groupChatId, config.botToken, joinRequest.from, now);
  }

  return { kind: "ignored" };
}

/** Constant-time comparison of the secret header: both sides are hashed so length leaks nothing. */
export async function isValidTelegramSecret(received: string | null, expected: string | undefined): Promise<boolean> {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
