import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomToken } from "@/lib/crypto/secret-box";
import { getMemberTier } from "@/lib/membership/member-access";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { issueNonce } from "@/lib/onboarding/nonces";
import { DISCORD_AUTHORIZE_URL, DISCORD_OAUTH_SCOPES, discordRedirectUri, readDiscordConfig } from "@/lib/community/discord-api";
import {
  appUrl,
  DISCORD_OAUTH_NONCE_TTL_MS,
  localeOrDefault,
  noStoreRedirect,
  onboardingRedirectUrl,
  pkceChallenge,
  sessionUserId,
} from "@/lib/community/discord-oauth";
import { defaultLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * Start linking Discord: a signed-in member with an effective tier gets a single-use state nonce
 * (holding the PKCE verifier and locale, sealed at rest) and is sent to Discord's consent screen.
 */
export async function GET(request: Request) {
  if (!isOnboardingV2Enabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const locale = localeOrDefault(url.searchParams.get("locale"));
  const userId = await sessionUserId(request);
  if (!userId) {
    const callbackUrl = `${url.pathname}?locale=${locale}`;
    const signIn = `${appUrl()}${locale === defaultLocale ? "" : `/${locale}`}/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    return noStoreRedirect(signIn);
  }

  const db = getDb();
  const { tier } = await getMemberTier(db, userId);
  if (tier === "none") return NextResponse.json({ error: "membership_required" }, { status: 403 });

  const { clientId } = readDiscordConfig();
  if (!clientId) {
    console.error("Discord onboarding is not configured (DISCORD_CLIENT_ID missing)");
    return noStoreRedirect(onboardingRedirectUrl(locale, { error: "discord_failed" }));
  }

  const codeVerifier = randomToken(32);
  const state = await issueNonce(db, {
    kind: "discord_oauth",
    userId,
    payload: { codeVerifier, locale },
    ttlMs: DISCORD_OAUTH_NONCE_TTL_MS,
  });
  const authorize = new URL(DISCORD_AUTHORIZE_URL);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: DISCORD_OAUTH_SCOPES,
    redirect_uri: discordRedirectUri(appUrl()),
    state,
    code_challenge: await pkceChallenge(codeVerifier),
    code_challenge_method: "S256",
  }).toString();
  return noStoreRedirect(authorize.toString());
}
