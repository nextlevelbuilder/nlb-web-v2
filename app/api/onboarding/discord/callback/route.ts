import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import { communityConnections } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { isUniqueViolation } from "@/lib/membership/member-access";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { enqueueAccessReconcile } from "@/lib/onboarding/jobs";
import { consumeNonce } from "@/lib/onboarding/nonces";
import { ProviderError } from "@/lib/community/types";
import { discordRedirectUri, exchangeDiscordCode, fetchDiscordUser, readDiscordConfig, type DiscordTokenSet, type DiscordUser } from "@/lib/community/discord-api";
import {
  appUrl,
  localeOrDefault,
  noStoreRedirect,
  onboardingRedirectUrl,
  scheduleJobRun,
  sessionUserId,
  type DiscordLinkErrorCode,
} from "@/lib/community/discord-oauth";

export const dynamic = "force-dynamic";

/**
 * Store the link. A Discord account belongs to at most one NLB user, and an NLB user to at most one
 * Discord account: a different account on either side is refused, never moved, because the
 * previously linked account would otherwise keep its roles.
 */
async function saveConnection(
  db: AppDb,
  userId: string,
  discordUser: DiscordUser,
  tokens: DiscordTokenSet
): Promise<DiscordLinkErrorCode | null> {
  const [byAccount] = await db
    .select({ userId: communityConnections.userId })
    .from(communityConnections)
    .where(and(eq(communityConnections.provider, "discord"), eq(communityConnections.externalUserId, discordUser.id)))
    .limit(1);
  if (byAccount && byAccount.userId !== userId) return "discord_in_use";

  const [byUser] = await db
    .select({ externalUserId: communityConnections.externalUserId })
    .from(communityConnections)
    .where(and(eq(communityConnections.userId, userId), eq(communityConnections.provider, "discord")))
    .limit(1);
  if (byUser && byUser.externalUserId !== discordUser.id) return "discord_in_use";

  const now = new Date();
  const sealed = {
    displayName: discordUser.displayName,
    accessTokenEnc: await encryptSecret(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? await encryptSecret(tokens.refreshToken) : null,
    tokenExpiresAt: tokens.expiresAt,
    updatedAt: now,
  };
  try {
    await db
      .insert(communityConnections)
      .values({ userId, provider: "discord", externalUserId: discordUser.id, linkedAt: now, createdAt: now, ...sealed })
      .onConflictDoUpdate({
        target: [communityConnections.userId, communityConnections.provider],
        set: sealed,
        // Same account re-linking refreshes its tokens; a concurrent different account is not overwritten.
        setWhere: eq(communityConnections.externalUserId, discordUser.id),
      });
  } catch (error) {
    if (isUniqueViolation(error)) return "discord_in_use";
    throw error;
  }

  const [stored] = await db
    .select({ externalUserId: communityConnections.externalUserId })
    .from(communityConnections)
    .where(and(eq(communityConnections.userId, userId), eq(communityConnections.provider, "discord")))
    .limit(1);
  return stored?.externalUserId === discordUser.id ? null : "discord_in_use";
}

/**
 * Discord OAuth callback: the state nonce must be unused, unexpired and issued to the signed-in
 * user. The code is exchanged with its PKCE verifier, tokens are sealed at rest, and access is
 * granted by the reconcile job, never inline.
 */
export async function GET(request: Request) {
  if (!isOnboardingV2Enabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const params = new URL(request.url).searchParams;
  const db = getDb();
  const nonce = await consumeNonce(db, { kind: "discord_oauth", raw: params.get("state") ?? "" });
  const locale = localeOrDefault(nonce?.payload?.locale);
  const fail = (error: DiscordLinkErrorCode) => noStoreRedirect(onboardingRedirectUrl(locale, { error }));

  const userId = await sessionUserId(request);
  if (!nonce || !userId || nonce.userId !== userId) return fail("discord_state");
  if (params.get("error")) return fail("discord_denied");

  const code = params.get("code");
  const codeVerifier = nonce.payload?.codeVerifier;
  if (!code || typeof codeVerifier !== "string") return fail("discord_state");

  const config = readDiscordConfig();
  if (!config.clientId || !config.clientSecret) {
    console.error("Discord onboarding is not configured (client id or secret missing)");
    return fail("discord_failed");
  }

  let tokens: DiscordTokenSet;
  let discordUser: DiscordUser;
  try {
    tokens = await exchangeDiscordCode(
      { clientId: config.clientId, clientSecret: config.clientSecret },
      { code, codeVerifier, redirectUri: discordRedirectUri(appUrl()) }
    );
    discordUser = await fetchDiscordUser(tokens.accessToken);
  } catch (error) {
    console.warn(`Discord link failed: ${error instanceof ProviderError ? error.code : "unexpected_error"}`);
    return fail("discord_failed");
  }

  const linkError = await saveConnection(db, userId, discordUser, tokens);
  if (linkError) return fail(linkError);

  await enqueueAccessReconcile(db, userId, ["discord_guild"]);
  scheduleJobRun(db);
  return noStoreRedirect(onboardingRedirectUrl(locale, { linked: true }));
}
