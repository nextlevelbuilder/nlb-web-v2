import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { hashToken } from "@/lib/crypto/secret-box";
import type { AppDb } from "@/lib/db";
import { communityConnections } from "@/lib/db/schema";
import { getMemberTier } from "@/lib/membership/member-access";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { issueNonce } from "@/lib/onboarding/nonces";
import { runDueJobs } from "@/lib/onboarding/runner";
import { createTelegramClient, getTelegramBotUsername, getTelegramConfig } from "./telegram-api";
import { ProviderError, type CommunityConnection, type MembershipTier } from "./types";

export const TELEGRAM_LINK_TTL_MS = 10 * 60 * 1000;
export const TELEGRAM_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const errorResponse = (error: string, status: number, headers?: HeadersInit) =>
  Response.json({ error }, { status, headers });

/** The Telegram connection a user linked through NLB, if any. */
export async function findTelegramConnectionByUser(db: AppDb, userId: string): Promise<CommunityConnection | null> {
  const [row] = await db
    .select()
    .from(communityConnections)
    .where(and(eq(communityConnections.userId, userId), eq(communityConnections.provider, "telegram")))
    .limit(1);
  return row ?? null;
}

/** The NLB connection for a Telegram account id, if that account was linked. */
export async function findTelegramConnectionByTelegramId(db: AppDb, telegramUserId: string): Promise<CommunityConnection | null> {
  const [row] = await db
    .select()
    .from(communityConnections)
    .where(and(eq(communityConnections.provider, "telegram"), eq(communityConnections.externalUserId, telegramUserId)))
    .limit(1);
  return row ?? null;
}

/** Drain queued onboarding jobs after the response, when the Worker context is available. */
export function scheduleOnboardingJobRun(db: AppDb): void {
  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(
      runDueJobs(db, { limit: 5 }).catch(() => {
        console.warn("onboarding job run after a Telegram update failed; the cron will retry");
      })
    );
  } catch {
    // No Worker context (local Node, tests): the minute cron drains the queue.
  }
}

/**
 * Gate for the member-facing Telegram routes: flag on, signed in, and an effective paid tier.
 * Returns a ready error response otherwise. The tier comes only from verified Polar state.
 */
export async function requireEntitledMember(
  request: Request,
  db: AppDb
): Promise<{ userId: string; tier: Exclude<MembershipTier, "none"> } | Response> {
  if (!isOnboardingV2Enabled()) return errorResponse("not_found", 404);
  let userId: string | undefined;
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    userId = session?.user?.id ?? undefined;
  } catch {
    userId = undefined;
  }
  if (!userId) return errorResponse("unauthorized", 401);
  const { tier } = await getMemberTier(db, userId);
  if (tier === "none") return errorResponse("membership_required", 403);
  return { userId, tier };
}

/** One-time `t.me` deep link that binds the Telegram account opening it to this NLB user. */
export async function createTelegramLinkResponse(db: AppDb, userId: string): Promise<Response> {
  const botUsername = getTelegramBotUsername();
  if (!botUsername) return errorResponse("telegram_not_configured", 503);
  // A 32-byte base64url token: 43 chars of [A-Za-z0-9_-], a valid Telegram start parameter.
  const nonce = await issueNonce(db, { kind: "telegram_link", userId, ttlMs: TELEGRAM_LINK_TTL_MS });
  return Response.json({ url: `https://t.me/${botUsername}?start=${nonce}` });
}

/**
 * Per-user invite link into the community group. It only creates a join request, which the webhook
 * approves after checking the account link and tier again. The link name is a short hash, not PII.
 */
export async function createTelegramJoinLinkResponse(db: AppDb, userId: string, now: Date = new Date()): Promise<Response> {
  const connection = await findTelegramConnectionByUser(db, userId);
  if (!connection) return errorResponse("telegram_not_linked", 409);
  const config = getTelegramConfig();
  if (!config) return errorResponse("telegram_not_configured", 503);

  const shortId = (await hashToken(`telegram-invite:${userId}`)).slice(0, 10);
  try {
    const invite = await createTelegramClient(config.botToken).createChatInviteLink(config.groupChatId, {
      name: `nlb-${shortId}`,
      expireDate: Math.floor((now.getTime() + TELEGRAM_INVITE_TTL_MS) / 1000),
    });
    return Response.json({ url: invite.invite_link });
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    console.warn(`telegram invite link failed: ${error.code}`);
    if (error.retryable) {
      const retryAfter = error.retryAfterMs ? { "retry-after": String(Math.ceil(error.retryAfterMs / 1000)) } : undefined;
      return errorResponse(error.code, 503, retryAfter);
    }
    return errorResponse(error.code, 502);
  }
}
