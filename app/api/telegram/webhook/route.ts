import { getDb } from "@/lib/db";
import { getOnboardingEnv, isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { handleTelegramUpdate, isValidTelegramSecret, type TelegramUpdate } from "@/lib/community/telegram-webhook";

const OK = () => Response.json({ ok: true });

/**
 * Telegram Bot API webhook (registered with `scripts/telegram/set-webhook.ts`). Authenticated only
 * by the `X-Telegram-Bot-Api-Secret-Token` header. Every handled or ignored update answers 200 so
 * Telegram does not redeliver it; only transient provider failures answer 503 to get a retry.
 */
export async function POST(request: Request) {
  const env = getOnboardingEnv();
  const authorized = await isValidTelegramSecret(
    request.headers.get("x-telegram-bot-api-secret-token"),
    env.TELEGRAM_WEBHOOK_SECRET
  );
  if (!authorized) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isOnboardingV2Enabled(env)) return OK();

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return OK();
  }
  if (!update || typeof update !== "object") return OK();

  const outcome = await handleTelegramUpdate(getDb(), update);
  if (outcome.kind === "retry") return Response.json({ error: "retry" }, { status: 503 });
  if (outcome.kind === "reply") {
    return Response.json({ method: "sendMessage", chat_id: outcome.chatId, text: outcome.text });
  }
  return OK();
}
