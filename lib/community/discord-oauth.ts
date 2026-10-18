import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getOnboardingEnv, onboardingPath } from "@/lib/onboarding/flags";
import { runDueJobs } from "@/lib/onboarding/runner";
import { defaultLocale, isLocale, type Locale } from "@/i18n/routing";

/** Error codes the onboarding page renders after the Discord callback. */
export type DiscordLinkErrorCode = "discord_denied" | "discord_state" | "discord_in_use" | "discord_failed" | "membership_required";

export const DISCORD_OAUTH_NONCE_TTL_MS = 10 * 60 * 1000;

/** Public origin used for the OAuth redirect URI and the post-link redirect. */
export function appUrl(): string {
  return (getOnboardingEnv().NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_APP_URL).replace(/\/+$/, "");
}

export function localeOrDefault(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

/** The signed-in NLB user id from the Better Auth session cookie, if any. */
export async function sessionUserId(request: Request): Promise<string | null> {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export function onboardingRedirectUrl(locale: Locale, outcome: { linked: true } | { error: DiscordLinkErrorCode }): string {
  const query = "linked" in outcome ? "discord=linked" : `error=${outcome.error}`;
  return `${appUrl()}${onboardingPath(locale)}?${query}`;
}

/** Redirect that no cache keeps: it answers a one-time, per-user OAuth step. */
export function noStoreRedirect(url: string, status = 302): Response {
  return new Response(null, { status, headers: { location: url, "cache-control": "no-store" } });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 7636 S256 code challenge for a PKCE verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

/** Drain queued onboarding jobs after the response, when the Worker context is available. */
export function scheduleJobRun(db: AppDb): void {
  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(
      runDueJobs(db, { limit: 5 }).catch(() => {
        console.warn("onboarding job run after Discord link failed; the cron will retry");
      })
    );
  } catch {
    // No Worker context (local Node, tests): the minute cron drains the queue.
  }
}
