import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import OnboardingFlow from "@/components/onboarding/onboarding-flow";
import {
  DISCORD_ERROR_CODES,
  ONBOARDING_SUPPORT_EMAIL as SUPPORT_EMAIL,
  type DiscordErrorCode,
} from "@/components/onboarding/onboarding-api";
import { Link } from "@/i18n/navigation";
import { isLocale, defaultLocale } from "@/i18n/routing";
import { getAuth } from "@/lib/auth";
import { isOnboardingV2Enabled, onboardingPath } from "@/lib/onboarding/flags";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function OnboardingPage({ params, searchParams }: Props) {
  if (!isOnboardingV2Enabled()) notFound();
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: "onboarding" });

  const rawCheckout = first(query.checkout_id);
  const checkoutId = rawCheckout && /^[A-Za-z0-9_-]{1,100}$/.test(rawCheckout) ? rawCheckout : null;
  const rawError = first(query.error);
  const discordError = DISCORD_ERROR_CODES.includes(rawError as DiscordErrorCode) ? (rawError as DiscordErrorCode) : null;

  let signedIn = false;
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    signedIn = Boolean(session?.user);
  } catch {
    signedIn = false;
  }

  const path = onboardingPath(isLocale(locale) ? locale : defaultLocale);
  const callbackUrl = checkoutId ? `${path}?checkout_id=${encodeURIComponent(checkoutId)}` : path;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-3xl space-y-10 pb-section-sm pt-[calc(var(--header-h)+3rem)] md:pt-[calc(var(--header-h)+4.5rem)]">
          <header className="space-y-4 text-center">
            <p className="eyebrow justify-center">{t("eyebrow")}</p>
            <h1 className="font-display text-step-3xl font-light">{t("title")}</h1>
            <p className="lede mx-auto">{t("lede")}</p>
          </header>

          {signedIn ? (
            <OnboardingFlow
              checkoutId={checkoutId}
              discordLinked={first(query.discord) === "linked"}
              discordError={discordError}
              supportEmail={SUPPORT_EMAIL}
            />
          ) : (
            <section aria-labelledby="onboarding-sign-in" className="surface-panel mx-auto max-w-md space-y-6 p-8 text-center shadow-constellation sm:p-10">
              <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-sm border border-line text-primary">
                <LogIn className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <div className="space-y-2">
                <h2 id="onboarding-sign-in" className="font-display text-step-2xl font-light">{t("signIn.title")}</h2>
                <p className="text-step-sm text-ink-2">{t("signIn.desc")}</p>
              </div>
              <Button asChild size="lg" className="w-full">
                <Link href={{ pathname: "/sign-in", query: { callbackUrl } }}>{t("signIn.cta")}</Link>
              </Button>
              <p className="text-step-sm text-ink-3">
                {t("support.prefix")}{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-foreground underline underline-offset-4">
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
