import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import ChapterPlate from "@/components/constellation/chapter-plate";
import AffiliateLevelTable from "@/components/affiliates/affiliate-level-table";
import { affiliateLevelName } from "@/components/affiliates/affiliate-level-name";
import { budgetSplitExample, formatBps, formatMoney } from "@/components/affiliates/affiliate-format";
import { AFFILIATE_PLATE_COORD, AFFILIATE_PLATE_NUMERAL } from "@/components/affiliates/affiliate-plate";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { MEMBERSHIP_PLAN_NAMES, MEMBERSHIP_PRICES } from "@/lib/constants/launch";
import { getDb } from "@/lib/db";
import { buildFaqPageJsonLd } from "@/lib/home/home-faq";
import { getProgram } from "@/lib/referrals/affiliate-read-models";
import { isAffiliatesEnabled } from "@/lib/referrals/referral-env";
import { localizedPath, pageMetadata, serializeJsonLd, siteUrl } from "@/lib/seo";
import { breadcrumbJsonLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

interface AffiliatesPageProps {
  params: Promise<{ locale: string }>;
}

const FAQ_KEYS = ["1", "2", "3", "4", "5", "6"] as const;

export async function generateMetadata({ params }: AffiliatesPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isAffiliatesEnabled()) return { title: "Not found", robots: { index: false } };
  const t = await getTranslations({ locale, namespace: "affiliates" });
  return pageMetadata({ title: t("metaTitle"), description: t("metaDescription"), path: "/affiliates", locale });
}

/** Public affiliate program page: how it works, levels, the budget split, rules, payouts and FAQ. */
export default async function AffiliatesPage({ params }: AffiliatesPageProps) {
  if (!isAffiliatesEnabled()) notFound();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "affiliates" });
  const program = await getProgram(getDb());

  const money = (minor: number) => formatMoney(minor, program.currency, locale);
  const pct = (bps: number) => formatBps(bps, locale);
  const examplePlan = "premium" as const;
  const example = budgetSplitExample(program.levels, MEMBERSHIP_PRICES[examplePlan].quarterly.amount * 100);
  const threshold = money(program.payoutThresholdMinor);

  const faq = FAQ_KEYS.map((key) => ({
    question: t(`faq.q${key}`),
    answer: t(`faq.a${key}`, { days: program.holdDays, threshold }),
  }));
  const pageUrl = `${siteUrl()}${localizedPath("/affiliates", locale)}`;
  const jsonLd = [
    breadcrumbJsonLd([{ name: "Next Level Builders", path: "/" }, { name: t("navLabel"), path: "/affiliates" }], locale),
    buildFaqPageJsonLd(faq, pageUrl),
  ];

  const steps = [1, 2, 3].map((n) => ({ title: t(`how.step${n}Title`), body: t(`how.step${n}Body`) }));
  const rules = [
    t("rules.first"),
    t("rules.signedIn"),
    t("rules.window", { days: program.attributionWindowDays }),
    t("rules.privacy"),
    t("rules.disclose"),
    t("rules.conduct"),
  ];
  const payouts = [
    t("payouts.hold", { days: program.holdDays }),
    t("payouts.threshold", { threshold }),
    t("payouts.paypal", { fee: pct(program.payoutFees.paypalServiceFeeBps) }),
    t("payouts.bank"),
    t("payouts.refunds"),
  ];
  const splitRows = [
    { label: t("split.rowPrice"), value: money(example.preview.priceMinor) },
    { label: t("split.rowDiscount", { rate: pct(example.discountBps) }), value: `− ${money(example.preview.discountMinor)}` },
    { label: t("split.rowPays"), value: money(example.preview.buyerPaysMinor), strong: true },
    { label: t("split.rowCommission", { rate: pct(example.commissionBps) }), value: money(example.preview.commissionMinor), accent: true },
    { label: t("split.rowKeeps"), value: money(example.preview.merchantKeepsMinor) },
  ];

  return (
    <main id="main" className="sky-backdrop flex-1 pb-section-sm">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="wrap">
        <header className="page-head">
          <ChapterPlate numeral={AFFILIATE_PLATE_NUMERAL} name={t("plateName")} coord={AFFILIATE_PLATE_COORD} />
          <h1 className="h1-page">
            {t("headingLead")}
            <em>{t("headingAccent")}</em>
            {t("headingTail")}
          </h1>
          <p className="lede">{t("lede")}</p>
          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="h-auto min-h-[52px] max-w-full gap-2 whitespace-normal py-3 text-center">
              <Link href="/account/referrals">
                {t("ctaJoin")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Link href="/policies/affiliate-agreement" className="link-arrow text-step-sm">
              {t("ctaAgreement")}
            </Link>
          </div>
          <p role="note" className="mt-8 max-w-[62ch] rounded-sm border border-line-strong bg-surface p-4 text-step-sm text-ink-2">
            {t("earlyAccess")}
          </p>
        </header>

        <div className="space-y-section-sm">
          <section aria-labelledby="aff-how" className="space-y-6">
            <ChapterPlate numeral="I" name={t("how.plate")} coord="" />
            <h2 id="aff-how" className="h-section">{t("how.title")}</h2>
            <ol className="grid gap-4 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="surface-panel space-y-3 p-6">
                  <span aria-hidden className="mono-label text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-step-lg text-foreground">{step.title}</h3>
                  <p className="text-step-sm text-ink-2">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="aff-levels" className="space-y-6">
            <ChapterPlate numeral="II" name={t("levels.plate")} coord="" />
            <h2 id="aff-levels" className="h-section">{t("levels.title")}</h2>
            <p className="max-w-[62ch] text-step-base text-ink-2">{t("levels.body")}</p>
            <AffiliateLevelTable levels={program.levels} locale={locale} />
            <p className="max-w-[62ch] text-step-sm text-ink-3">{t("levels.footnote")}</p>
          </section>

          <section aria-labelledby="aff-split" className="space-y-6">
            <ChapterPlate numeral="III" name={t("split.plate")} coord="" />
            <h2 id="aff-split" className="h-section">{t("split.title")}</h2>
            <p className="max-w-[62ch] text-step-base text-ink-2">{t("split.body")}</p>
            <figure className="surface-panel max-w-2xl space-y-4 p-6 sm:p-8">
              <figcaption className="space-y-2">
                <span className="mono-label block text-ink-3">{t("split.exampleTitle")}</span>
                <span className="block text-step-sm text-ink-2">
                  {t("split.exampleIntro", {
                    plan: MEMBERSHIP_PLAN_NAMES[examplePlan],
                    price: money(example.preview.priceMinor),
                    level: affiliateLevelName(t, example.levelKey),
                    budget: pct(example.budgetBps),
                    discount: pct(example.discountBps),
                  })}
                </span>
              </figcaption>
              <dl className="divide-y divide-line border-y border-line">
                {splitRows.map((row) => (
                  <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                    <dt className={row.strong ? "text-step-sm text-foreground" : "text-step-sm text-ink-2"}>{row.label}</dt>
                    <dd className={`num-tab font-display text-step-lg ${row.accent ? "text-primary" : "text-foreground"}`}>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-step-sm text-ink-2">{t("split.zeroDiscount", { budget: pct(example.zeroDiscountCommissionBps) })}</p>
              <p className="text-step-xs text-ink-3">{t("split.note")}</p>
            </figure>
          </section>

          <section aria-labelledby="aff-rules" className="space-y-6">
            <ChapterPlate numeral="IV" name={t("rules.plate")} coord="" />
            <h2 id="aff-rules" className="h-section">{t("rules.title")}</h2>
            <ul className="grid max-w-3xl gap-3">
              {rules.map((rule) => (
                <li key={rule} className="flex gap-3 text-step-base text-ink-2">
                  <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rotate-45 bg-primary" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="aff-payouts" className="space-y-6">
            <ChapterPlate numeral="V" name={t("payouts.plate")} coord="" />
            <h2 id="aff-payouts" className="h-section">{t("payouts.title")}</h2>
            <ul className="grid max-w-3xl gap-3">
              {payouts.map((item) => (
                <li key={item} className="flex gap-3 text-step-base text-ink-2">
                  <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rotate-45 bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="aff-faq" className="space-y-6">
            <ChapterPlate numeral="VI" name={t("faq.plate")} coord="" />
            <h2 id="aff-faq" className="h-section">{t("faq.title")}</h2>
            <div className="max-w-3xl divide-y divide-line border-y border-line">
              {faq.map((item) => (
                <details key={item.question} className="group py-2">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 py-2 text-step-base text-foreground [&::-webkit-details-marker]:hidden">
                    <span>{item.question}</span>
                    <span aria-hidden className="font-mono text-primary transition-transform duration-base group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-4 text-step-sm text-ink-2">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section aria-labelledby="aff-final" className="surface-panel flex flex-col items-start gap-5 p-6 sm:p-10">
            <h2 id="aff-final" className="font-display text-step-2xl font-light">{t("final.title")}</h2>
            <p className="max-w-[56ch] text-step-base text-ink-2">{t("final.body")}</p>
            <Button asChild size="lg" className="h-auto min-h-[52px] max-w-full gap-2 whitespace-normal py-3 text-center">
              <Link href="/account/referrals">
                {t("final.cta")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </section>
        </div>
      </div>
    </main>
  );
}
