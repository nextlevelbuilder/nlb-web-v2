import { getCloudflareContext } from "@opennextjs/cloudflare";
import { defaultLocale, type Locale } from "@/i18n/routing";

/** Runtime vars and secrets the onboarding feature reads. All optional: callers decide how to fail. */
export type OnboardingEnvKey =
  | "ONBOARDING_V2_ENABLED"
  | "MEMBERSHIP_PAST_DUE_GRACE_DAYS"
  | "ONBOARDING_ENCRYPTION_KEY"
  | "POLAR_SERVER"
  | "LARK_ADMIN_WEBHOOK_URL"
  | "NEXT_PUBLIC_APP_URL"
  | "DISCORD_CLIENT_ID"
  | "DISCORD_CLIENT_SECRET"
  | "DISCORD_BOT_TOKEN"
  | "DISCORD_GUILD_ID"
  | "DISCORD_PREMIUM_ROLE_ID"
  | "DISCORD_VIP_ROLE_ID"
  | "TELEGRAM_BOT_TOKEN"
  | "TELEGRAM_BOT_USERNAME"
  | "TELEGRAM_WEBHOOK_SECRET"
  | "TELEGRAM_GROUP_CHAT_ID";
export type OnboardingRuntimeEnv = Partial<Record<OnboardingEnvKey, string>>;

export const DEFAULT_PAST_DUE_GRACE_DAYS = 7;

/**
 * Resolve onboarding config per request. Inside the Worker the OpenNext context env holds wrangler
 * vars and secrets; the cron handler, local Next, scripts and tests have no request context and
 * fall back to process.env (workerd populates it from the same bindings under nodejs_compat).
 */
export function getOnboardingEnv(): OnboardingRuntimeEnv {
  try {
    const context = getCloudflareContext();
    if (context?.env) return { ...(process.env as OnboardingRuntimeEnv), ...(context.env as OnboardingRuntimeEnv) };
  } catch {
    // No OpenNext request context (cron, local Node, vitest).
  }
  return process.env as OnboardingRuntimeEnv;
}

/** True only when `ONBOARDING_V2_ENABLED` is exactly "true". Anything else keeps the legacy flow. */
export function isOnboardingV2Enabled(source: OnboardingRuntimeEnv = getOnboardingEnv()): boolean {
  return source.ONBOARDING_V2_ENABLED === "true";
}

/** Path of the onboarding page; English is unprefixed (`localePrefix: "as-needed"`). */
export function onboardingPath(locale: Locale): string {
  return `${locale === defaultLocale ? "" : `/${locale}`}/onboarding`;
}

/** Days a `past_due` subscription keeps access, counted from `past_due_since`. */
export function getPastDueGraceDays(source: OnboardingRuntimeEnv = getOnboardingEnv()): number {
  const parsed = Number.parseInt(source.MEMBERSHIP_PAST_DUE_GRACE_DAYS ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_PAST_DUE_GRACE_DAYS;
}
