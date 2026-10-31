import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Lock, Megaphone, Wallet } from "lucide-react";
import ChapterPlate from "@/components/constellation/chapter-plate";
import AffiliateEnrollForm from "@/components/affiliates/affiliate-enroll-form";
import { formatBps, formatMoney, levelProgressPercent } from "@/components/affiliates/affiliate-format";
import { AffiliateConversionsTable, AffiliateLedgerTable, AffiliatePayoutsTable } from "@/components/affiliates/affiliate-history-tables";
import { affiliateLevelName } from "@/components/affiliates/affiliate-level-name";
import AffiliateLevelTable from "@/components/affiliates/affiliate-level-table";
import AffiliateLinksPanel from "@/components/affiliates/affiliate-links-panel";
import AffiliatePayoutMethodForm from "@/components/affiliates/affiliate-payout-method-form";
import { AFFILIATE_PLATE_COORD, AFFILIATE_PLATE_NUMERAL } from "@/components/affiliates/affiliate-plate";
import { Button } from "@/components/ui/button";
import { Link, getPathname } from "@/i18n/navigation";
import { getAuth } from "@/lib/auth";
import { MEMBERSHIP_PRICES } from "@/lib/constants/launch";
import { getDb } from "@/lib/db";
import { MAX_LINKS_PER_AFFILIATE } from "@/lib/referrals/affiliate-links";
import { affiliateSummary, getProgram, listAffiliatePayouts, listConversions, listLedger, listLinkViews } from "@/lib/referrals/affiliate-read-models";
import { findAffiliateByUser } from "@/lib/referrals/affiliates";
import { LEDGER_BUCKETS } from "@/lib/referrals/commission-ledger";
import { isAffiliatePayoutsEnabled, isAffiliatesEnabled } from "@/lib/referrals/referral-env";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface ReferralsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: ReferralsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isAffiliatesEnabled()) return { title: "Not found", robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: "affiliateAccount" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** Example list price for link previews: the Premium quarterly plan. */
const EXAMPLE_PRICE_MINOR = MEMBERSHIP_PRICES.premium.quarterly.amount * 100;

async function loadSession() {
  try {
    return await getAuth().api.getSession({ headers: await headers() });
  } catch (error) {
    console.warn("Affiliate dashboard session retrieval error:", error instanceof Error ? error.name : "error");
    return null;
  }
}

async function loadDashboard(userId: string) {
  const db = getDb();
  const [program, affiliate] = await Promise.all([getProgram(db), findAffiliateByUser(db, userId)]);
  if (!affiliate) return { program, enrolled: null };
  const [summary, links, conversions, ledger, payouts] = await Promise.all([
    affiliateSummary(db, affiliate),
    listLinkViews(db, affiliate, siteUrl()),
    listConversions(db, affiliate.id, 50),
    listLedger(db, affiliate.id, 100),
    listAffiliatePayouts(db, affiliate.id),
  ]);
  return { program, enrolled: { summary, links, conversions, ledger, payouts } };
}

/** Member affiliate dashboard: join, level and budget, balances, links, history, payout method. */
export default async function AffiliateDashboardPage({ params }: ReferralsPageProps) {
  if (!isAffiliatesEnabled()) notFound();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "affiliateAccount" });
  const tLevels = await getTranslations({ locale, namespace: "affiliates" });
  const session = await loadSession();

  if (!session?.user) {
    return (
      <main id="main" className="sky-backdrop flex flex-1 items-center justify-center px-4 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
        <section aria-labelledby="referrals-login" className="surface-panel w-full max-w-md space-y-6 p-8 text-center shadow-constellation sm:p-10">
          <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-sm border border-line text-primary">
            <Lock className="h-6 w-6" strokeWidth={1.5} />
          </span>
          <div className="space-y-2">
            <h1 id="referrals-login" className="font-display text-step-2xl font-light">{t("signedOutTitle")}</h1>
            <p className="text-step-sm text-ink-2">{t("signedOutDesc")}</p>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link href={{ pathname: "/sign-in", query: { callbackUrl: getPathname({ href: "/account/referrals", locale }) } }}>{t("signedOutBtn")}</Link>
          </Button>
          <Link href="/affiliates" className="link-arrow justify-center text-step-sm">{t("programLink")}</Link>
        </section>
      </main>
    );
  }

  let data: Awaited<ReturnType<typeof loadDashboard>> | null = null;
  try {
    data = await loadDashboard(session.user.id);
  } catch (error) {
    console.error("Affiliate dashboard unavailable:", error instanceof Error ? error.message : "error");
  }

  const payoutsLive = isAffiliatePayoutsEnabled();
  const header = (
    <header className="space-y-5">
      <Link href="/account" className="link-arrow text-step-sm">
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
        {t("backToAccount")}
      </Link>
      <ChapterPlate numeral={AFFILIATE_PLATE_NUMERAL} name={t("plateName")} coord={AFFILIATE_PLATE_COORD} />
      <h1 className="font-display text-step-3xl font-light leading-[1.05]">{t("title")}</h1>
      <p className="lede max-w-[60ch]">{t("lede")}</p>
      <Link href="/affiliates" className="link-arrow text-step-sm">{t("programLink")}</Link>
    </header>
  );

  return (
    <main id="main" className="sky-backdrop flex-1">
      <div className="wrap max-w-5xl space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)] md:pt-[calc(var(--header-h)+4.5rem)]">
        {header}
        {!data ? (
          <p role="alert" className="surface-panel p-6 text-step-sm text-destructive">{t("loadError")}</p>
        ) : !data.enrolled ? (
          <>
            <section aria-labelledby="referrals-join" className="surface-panel space-y-6 p-6 sm:p-8">
              <div className="space-y-2">
                <h2 id="referrals-join" className="h-section flex items-center gap-3 !text-step-2xl">
                  <Megaphone aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                  {t("join.title")}
                </h2>
                <p className="max-w-[62ch] text-step-sm text-ink-2">{t("join.body")}</p>
              </div>
              <AffiliateEnrollForm termsVersion={data.program.termsVersion} />
            </section>
            <section aria-labelledby="referrals-levels" className="space-y-4">
              <h2 id="referrals-levels" className="font-display text-step-xl">{tLevels("levels.title")}</h2>
              <AffiliateLevelTable levels={data.program.levels} locale={locale} />
            </section>
          </>
        ) : (
          <EnrolledDashboard locale={locale} data={{ program: data.program, ...data.enrolled }} payoutsLive={payoutsLive} />
        )}
      </div>
    </main>
  );
}

type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
type EnrolledData = NonNullable<DashboardData["enrolled"]> & { program: DashboardData["program"] };

async function EnrolledDashboard({ locale, data, payoutsLive }: { locale: string; data: EnrolledData; payoutsLive: boolean }) {
  const t = await getTranslations({ locale, namespace: "affiliateAccount" });
  const tLevels = await getTranslations({ locale, namespace: "affiliates" });
  const { program, summary, links, conversions, ledger, payouts } = data;
  const money = (minor: number) => formatMoney(minor, program.currency, locale);
  const pct = (bps: number) => formatBps(bps, locale);
  const suspended = summary.status !== "active";

  const levels = [...program.levels].sort((a, b) => a.minCustomers - b.minCustomers);
  const current = levels.find((level) => level.key === summary.level) ?? levels[0];
  const next = summary.nextLevel ? levels.find((level) => level.key === summary.nextLevel?.key) ?? null : null;
  const progress = levelProgressPercent(summary.qualifyingCustomers, current.minCustomers, next?.minCustomers ?? null);
  const balanceDesc: Record<(typeof LEDGER_BUCKETS)[number], string> = {
    pending: t("balances.pendingDesc", { days: program.holdDays }),
    held: t("balances.heldDesc"),
    available: t("balances.availableDesc", { threshold: money(program.payoutThresholdMinor) }),
    payout_locked: t("balances.payout_lockedDesc"),
    paid: t("balances.paidDesc"),
  };

  return (
    <>
      {suspended && <p role="alert" className="rounded-sm border border-destructive/50 bg-destructive/10 p-4 text-step-sm text-foreground">{t("suspended")}</p>}
      {!payoutsLive && <p role="note" className="rounded-sm border border-line-strong bg-surface p-4 text-step-sm text-ink-2">{t("payoutsNotLive")}</p>}

      <section aria-labelledby="referrals-standing" className="surface-panel space-y-6 p-6 sm:p-8">
        <h2 id="referrals-standing" className="font-display text-step-xl">{t("standing.title")}</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2 rounded-sm border border-line bg-canvas-deep p-5">
            <dt className="mono-label text-ink-3">{t("standing.level")}</dt>
            <dd className="font-display text-step-2xl text-primary">{affiliateLevelName(tLevels, summary.level)}</dd>
          </div>
          <div className="space-y-2 rounded-sm border border-line bg-canvas-deep p-5">
            <dt className="mono-label text-ink-3">{t("standing.customers")}</dt>
            <dd className="num-tab font-display text-step-2xl text-foreground">{summary.qualifyingCustomers}</dd>
          </div>
          <div className="space-y-2 rounded-sm border border-line bg-canvas-deep p-5">
            <dt className="mono-label text-ink-3">{t("standing.budget")}</dt>
            <dd className="num-tab font-display text-step-2xl text-foreground">{pct(summary.budgetBps)}</dd>
            <dd className="text-step-xs text-ink-2">
              {summary.incentiveBasis === "member" ? t("standing.basisMember") : t("standing.basisOrdinary", { memberBudget: pct(current.memberBudgetBps) })}
            </dd>
          </div>
        </dl>
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-label={t("standing.progressLabel")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 w-full overflow-hidden rounded-full bg-line"
          >
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-step-sm text-ink-2">
            {summary.nextLevel
              ? t("standing.next", { count: summary.nextLevel.customersNeeded, level: affiliateLevelName(tLevels, summary.nextLevel.key) })
              : t("standing.top")}
          </p>
        </div>
      </section>

      <section aria-labelledby="referrals-balances" className="space-y-4">
        <h2 id="referrals-balances" className="flex items-center gap-2 font-display text-step-xl">
          <Wallet aria-hidden className="h-4 w-4 text-primary" />
          {t("balances.title")}
        </h2>
        <dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {LEDGER_BUCKETS.map((bucket) => (
            <div key={bucket} className="space-y-1 rounded-sm border border-line bg-surface p-4">
              <dt className="mono-label text-ink-3">{t(`balances.${bucket}`)}</dt>
              <dd className={`num-tab font-display text-step-xl ${bucket === "available" ? "text-primary" : "text-foreground"}`}>{money(summary.balances[`${bucket}Minor`])}</dd>
              <dd className="text-step-xs text-ink-2">{balanceDesc[bucket]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="referrals-links" className="space-y-4">
        <div className="space-y-2">
          <h2 id="referrals-links" className="font-display text-step-xl">{t("links.title")}</h2>
          <p className="text-step-sm text-ink-2">{t("links.body")}</p>
        </div>
        <AffiliateLinksPanel
          links={links}
          budgetBps={summary.budgetBps}
          currency={program.currency}
          examplePriceMinor={EXAMPLE_PRICE_MINOR}
          maxLinks={MAX_LINKS_PER_AFFILIATE}
          readOnly={suspended}
        />
      </section>

      <section aria-labelledby="referrals-disclosure" className="rounded-sm border border-primary/40 bg-primary/5 p-5 sm:p-6">
        <h2 id="referrals-disclosure" className="font-display text-step-lg">{t("disclosure.title")}</h2>
        <p className="mt-2 max-w-[70ch] text-step-sm text-ink-2">
          {t.rich("disclosure.body", {
            agreement: (chunks) => (
              <Link href="/policies/affiliate-agreement" className="text-primary underline underline-offset-4">{chunks}</Link>
            ),
          })}
        </p>
      </section>

      <section aria-labelledby="referrals-conversions" className="space-y-4">
        <div className="space-y-2">
          <h2 id="referrals-conversions" className="font-display text-step-xl">{t("conversions.title")}</h2>
          <p className="text-step-sm text-ink-2">{t("conversions.body")}</p>
        </div>
        <AffiliateConversionsTable conversions={conversions} locale={locale} />
      </section>

      <section aria-labelledby="referrals-ledger" className="space-y-4">
        <div className="space-y-2">
          <h2 id="referrals-ledger" className="font-display text-step-xl">{t("ledger.title")}</h2>
          <p className="text-step-sm text-ink-2">{t("ledger.body")}</p>
        </div>
        <AffiliateLedgerTable entries={ledger} locale={locale} />
      </section>

      <section aria-labelledby="referrals-payouts" className="space-y-4">
        <h2 id="referrals-payouts" className="font-display text-step-xl">{t("payouts.title")}</h2>
        <AffiliatePayoutsTable payouts={payouts} currency={program.currency} locale={locale} />
      </section>

      <section aria-labelledby="referrals-method" className="surface-panel space-y-4 p-6 sm:p-8">
        <div className="space-y-2">
          <h2 id="referrals-method" className="font-display text-step-xl">{t("payoutMethod.title")}</h2>
          <p className="text-step-sm text-ink-2">{t("payoutMethod.body")}</p>
        </div>
        <AffiliatePayoutMethodForm current={summary.payoutMethod} paypalFee={pct(program.payoutFees.paypalServiceFeeBps)} />
      </section>

      <section aria-labelledby="referrals-levels" className="space-y-4">
        <h2 id="referrals-levels" className="font-display text-step-xl">{tLevels("levels.title")}</h2>
        <AffiliateLevelTable levels={program.levels} locale={locale} currentKey={summary.level} />
        <p className="text-step-xs text-ink-3">{tLevels("levels.footnote")}</p>
      </section>
    </>
  );
}
