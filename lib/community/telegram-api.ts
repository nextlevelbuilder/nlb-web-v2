import { getOnboardingEnv, type OnboardingRuntimeEnv } from "@/lib/onboarding/flags";
import { ProviderError, PROVIDER_FETCH_TIMEOUT_MS, isFetchTimeout } from "./types";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramConfig {
  botToken: string;
  groupChatId: string;
}

/** Bot token and community group id, or null when either is missing. */
export function getTelegramConfig(source: OnboardingRuntimeEnv = getOnboardingEnv()): TelegramConfig | null {
  const botToken = source.TELEGRAM_BOT_TOKEN?.trim();
  const groupChatId = source.TELEGRAM_GROUP_CHAT_ID?.trim();
  if (!botToken || !groupChatId) return null;
  return { botToken, groupChatId };
}

/** Bot username without a leading `@`, used to build `t.me` deep links. */
export function getTelegramBotUsername(source: OnboardingRuntimeEnv = getOnboardingEnv()): string | null {
  const username = source.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return username || null;
}

export type TelegramChatMemberStatus = "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";

export interface TelegramChatMember {
  status: TelegramChatMemberStatus;
  /** Only on `restricted`: whether the user is still in the chat. */
  is_member?: boolean;
}

export interface TelegramChatInviteLink {
  invite_link: string;
}

interface TelegramErrorBody {
  ok: false;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

/**
 * Map a Bot API error to a storable code. Descriptions are matched, never stored: they can echo
 * request details. Permanent failures (bot not admin, chat not found) need an operator.
 */
function classifyError(status: number, body: TelegramErrorBody | null): ProviderError {
  if (status === 429) {
    const retryAfter = body?.parameters?.retry_after;
    return new ProviderError("telegram_rate_limited", {
      retryable: true,
      retryAfterMs: typeof retryAfter === "number" && retryAfter > 0 ? retryAfter * 1000 : undefined,
    });
  }
  if (status >= 500) return new ProviderError("telegram_unavailable", { retryable: true });
  if (status === 401 || status === 404) return new ProviderError("telegram_unauthorized");

  const description = (body?.description ?? "").toLowerCase();
  if (description.includes("chat not found")) return new ProviderError("telegram_chat_not_found");
  if (description.includes("user not found") || description.includes("participant_id_invalid")) {
    return new ProviderError("telegram_user_not_found");
  }
  if (description.includes("hide_requester_missing") || description.includes("user_already_participant")) {
    return new ProviderError("telegram_join_request_missing");
  }
  if (
    status === 403 ||
    description.includes("not enough rights") ||
    description.includes("admin") ||
    description.includes("can't remove chat owner")
  ) {
    return new ProviderError("telegram_bot_not_admin");
  }
  return new ProviderError("telegram_bad_request");
}

/**
 * Call one Bot API method. The token only appears in the request URL and never in errors or logs.
 * Throws `ProviderError`: retryable for 429 (with `retryAfterMs`), 5xx and network failures.
 */
export async function callTelegram<T>(
  botToken: string,
  method: string,
  params: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${TELEGRAM_API_BASE}/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ProviderError(isFetchTimeout(error) ? "telegram_timeout" : "telegram_network", { retryable: true });
  }

  let body: { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    if (response.ok) throw new ProviderError("telegram_bad_response", { retryable: true });
  }
  if (!response.ok || body.ok !== true) {
    throw classifyError(response.ok ? 400 : response.status, body as TelegramErrorBody);
  }
  return body.result as T;
}

export interface TelegramClient {
  getChatMember(chatId: string, userId: string): Promise<TelegramChatMember>;
  banChatMember(chatId: string, userId: string, untilDate: number): Promise<boolean>;
  unbanChatMember(chatId: string, userId: string): Promise<boolean>;
  approveChatJoinRequest(chatId: string, userId: string): Promise<boolean>;
  declineChatJoinRequest(chatId: string, userId: string): Promise<boolean>;
  createChatInviteLink(chatId: string, input: { name: string; expireDate: number }): Promise<TelegramChatInviteLink>;
}

export function createTelegramClient(botToken: string, fetchImpl: typeof fetch = fetch): TelegramClient {
  const call = <T>(method: string, params: Record<string, unknown>) => callTelegram<T>(botToken, method, params, fetchImpl);
  return {
    getChatMember: (chatId, userId) => call("getChatMember", { chat_id: chatId, user_id: Number(userId) }),
    banChatMember: (chatId, userId, untilDate) =>
      call("banChatMember", { chat_id: chatId, user_id: Number(userId), until_date: untilDate, revoke_messages: false }),
    unbanChatMember: (chatId, userId) =>
      call("unbanChatMember", { chat_id: chatId, user_id: Number(userId), only_if_banned: true }),
    approveChatJoinRequest: (chatId, userId) => call("approveChatJoinRequest", { chat_id: chatId, user_id: Number(userId) }),
    declineChatJoinRequest: (chatId, userId) => call("declineChatJoinRequest", { chat_id: chatId, user_id: Number(userId) }),
    createChatInviteLink: (chatId, { name, expireDate }) =>
      call("createChatInviteLink", { chat_id: chatId, name, expire_date: expireDate, creates_join_request: true }),
  };
}
