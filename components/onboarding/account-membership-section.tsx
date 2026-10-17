import { getTranslations } from "next-intl/server";
import { ArrowRight, Crown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { isOnboardingV2Enabled } from "@/lib/onboarding/flags";
import { getOnboardingStatus, needsOnboardingBanner, type OnboardingStatus, type OnboardingUser } from "@/lib/onboarding/status";
import { PRODUCT_IDS } from "@/lib/polar";
import AccountCommunityPanel from "./account-community-panel";
import MembershipUpgradeButton from "./membership-upgrade-button";
import { ONBOARDING_SUPPORT_EMAIL } from "./onboarding-api";

const KNOWN_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "canceled"]);

/**
 * Membership and community section of /account (onboarding v2 only): plan and renewal, Discord and
 * Telegram access with recovery actions, the Premium → VIP upgrade and the self-serve setup banner.
 */
export default async function AccountMembershipSection({ locale, user }: { locale: string; user: OnboardingUser }) {
  if (!isOnboardingV2Enabled()) return null;
  const t = await getTranslations({ locale, namespace: "accountMembership" });
  const tOnboarding = await getTranslations({ locale, namespace: "onboarding" });

  let status: OnboardingStatus;
  try {
    status = await getOnboardingStatus(getDb(), user);
  } catch (error) {
    console.warn("account membership section unavailable:", error instanceof Error ? error.name : "error");
    return null;
  }

  const { membership } = status;
  const dateFormat = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium" });
  const periodEnd = membership?.renewsAt ? new Date(membership.renewsAt) : null;
  const upgradeProductId =
    membership?.tier === "premium" ? (membership.term === "quarterly" ? PRODUCT_IDS.VIP_QUARTERLY : PRODUCT_IDS.VIP_ANNUAL) : null;

  return (
    <section aria-labelledby="account-membership" className="space-y-6">
      {needsOnboardingBanner(status) && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-sm border border-primary/50 bg-primary/10 p-5 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p className="font-display text-step-lg text-foreground">{t("banner.title")}</p>
            <p className="text-step-sm text-ink-2">{t("banner.desc")}</p>
          </div>
          <Button asChild size="sm" className="shrink-0 gap-2">
            <Link href="/onboarding">
              {t("banner.cta")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      )}

      <div className="surface-panel space-y-6 p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 id="account-membership" className="h-section flex items-center gap-3">
              <Crown aria-hidden className="h-5 w-5 shrink-0 text-primary" />
              {t("title")}
            </h2>
            <p className="mt-2 text-step-sm text-ink-2">{membership ? t("desc") : t("none")}</p>
          </div>
          {!membership && (
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link href={{ pathname: "/", hash: "pricing" }}>{t("noneCta")}</Link>
            </Button>
          )}
        </div>

        {membership && (
          <>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2 rounded-sm border border-line bg-canvas-deep p-5">
                <dt className="mono-label text-ink-3">{t("tierLabel")}</dt>
                <dd className="font-display text-step-2xl text-primary">{tOnboarding(`tier.${membership.tier}`)}</dd>
              </div>
              <div className="space-y-2 rounded-sm border border-line bg-canvas-deep p-5">
                <dt className="mono-label text-ink-3">{t("planLabel")}</dt>
                <dd className="text-step-base text-foreground">{membership.plan}</dd>
                <dd className="flex flex-wrap gap-2">
                  {membership.term && <Badge variant="secondary">{t(`term.${membership.term}`)}</Badge>}
                  <Badge variant="outline" className={membership.status === "past_due" ? "border-warning/50 text-warning" : "border-success/50 text-success"}>
                    {t(`subscriptionStatus.${KNOWN_SUBSCRIPTION_STATUSES.has(membership.status) ? membership.status : "other"}`)}
                  </Badge>
                </dd>
              </div>
              <div className="space-y-2 rounded-sm border border-line bg-canvas-deep p-5">
                <dt className="mono-label text-ink-3">{membership.cancelAtPeriodEnd ? t("endsLabel") : t("renewsLabel")}</dt>
                <dd className="text-step-base text-foreground">
                  {periodEnd ? <time dateTime={periodEnd.toISOString()}>{dateFormat.format(periodEnd)}</time> : "—"}
                </dd>
              </div>
            </dl>

            {membership.cancelAtPeriodEnd && <p className="text-step-sm text-ink-2">{t("cancelAtPeriodEnd")}</p>}
            {membership.status === "past_due" && <p className="text-step-sm text-warning">{t("pastDue")}</p>}

            {upgradeProductId && (
              <div className="flex flex-col items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <p className="font-display text-step-lg text-foreground">{t("upgrade.title")}</p>
                  <p className="text-step-sm text-ink-2">{t("upgrade.desc")}</p>
                  <p className="text-step-xs text-ink-3">{t("upgrade.note")}</p>
                </div>
                <MembershipUpgradeButton productId={upgradeProductId} />
              </div>
            )}
          </>
        )}
      </div>

      {membership && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 font-display text-step-xl">
            <Users aria-hidden className="h-4 w-4 text-primary" />
            {t("communityTitle")}
          </h2>
          <AccountCommunityPanel initial={status.connections} />
        </div>
      )}

      <p className="text-step-sm text-ink-3">
        {t("support")}{" "}
        <a href={`mailto:${ONBOARDING_SUPPORT_EMAIL}`} className="text-foreground underline underline-offset-4">
          {ONBOARDING_SUPPORT_EMAIL}
        </a>
      </p>
    </section>
  );
}
