import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import { defaultLocale, isLocale, locales } from "@/i18n/routing";
import { MEMBERSHIP_PLAN_NAMES, MEMBERSHIP_PLANS, MEMBERSHIP_PRICES } from "@/lib/constants/launch";
import { buildFaqPageJsonLd, HOME_FAQ_KEYS } from "@/lib/home/home-faq";
import { loadHomePageData } from "@/lib/home/home-page-data";
import { pageMetadata, serializeJsonLd, siteUrl } from "@/lib/seo";
import { organizationId } from "@/lib/structured-data";
import HookChapter from "@/components/constellation/hook-chapter";
import DarkChapter from "@/components/constellation/dark-chapter";
import CommunityChapter from "@/components/constellation/community-chapter";
import CoursesChapter from "@/components/constellation/courses-chapter";
import DirectoryChapter from "@/components/constellation/directory-chapter";
import ProofChapter from "@/components/constellation/proof-chapter";
import FoundersChapter from "@/components/constellation/founders-chapter";
import PartnersChapter from "@/components/constellation/partners-chapter";
import PricingChapter from "@/components/constellation/pricing-chapter";
import ToolkitsChapter from "@/components/constellation/toolkits-chapter";
import FaqChapter from "@/components/constellation/faq-chapter";
import FinaleChapter from "@/components/constellation/finale-chapter";
import HomeClient from "./home-client";
import "./constellation-home.css";

// Seats, activity and launched products are read from D1 per request, never at build time.
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string }>;

const homeUrl = (locale: string) => `${siteUrl()}${getPathname({ href: "/", locale })}`;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.meta" });
  const base = pageMetadata({ title: t("title"), description: t("description"), path: "/", locale });
  // EN is served unprefixed at `/`; build the homepage alternates from the routing config itself.
  return {
    ...base,
    title: { absolute: t("title") },
    alternates: {
      ...base.alternates,
      canonical: homeUrl(locale),
      languages: { ...Object.fromEntries(locales.map((l) => [l, homeUrl(l)])), "x-default": homeUrl(defaultLocale) },
    },
    openGraph: { ...base.openGraph, url: homeUrl(locale) },
  };
}

function membershipJsonLd(locale: string) {
  const url = homeUrl(locale);
  return MEMBERSHIP_PLANS.map((plan) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: `Next Level Builders ${MEMBERSHIP_PLAN_NAMES[plan]} membership`,
    brand: { "@id": organizationId() },
    url: `${url}#pricing`,
    offers: (["quarterly", "annual"] as const).map((cycle) => ({
      "@type": "Offer",
      price: MEMBERSHIP_PRICES[plan][cycle].amount,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${url}#pricing`,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: MEMBERSHIP_PRICES[plan][cycle].amount,
        priceCurrency: "USD",
        billingDuration: cycle === "annual" ? "P1Y" : "P3M",
      },
    })),
  }));
}

/** FAQPage structured data from the same localized Q&A the FAQ section renders. */
async function faqJsonLd(locale: string) {
  const t = await getTranslations({ locale, namespace: "faq" });
  const entries = HOME_FAQ_KEYS.map((key) => ({ question: t(`items.${key}.question`), answer: t(`items.${key}.answer`) }));
  return buildFaqPageJsonLd(entries, `${homeUrl(locale)}#faq`);
}

export default async function Home({ params }: { params: Params }) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);
  const [data, faq] = await Promise.all([loadHomePageData(locale), faqJsonLd(locale)]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(membershipJsonLd(locale)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faq) }} />
      <HomeClient locale={locale} productIds={data.productIds} seats={data.seats} activity={data.activity}>
        {/* Every chapter renders unconditionally: ScrollTrigger pins re-parent top-level sections. */}
        <main id="main">
          <HookChapter />
          <DarkChapter />
          <CommunityChapter />
          <CoursesChapter videos={data.courseVideos} />
          <DirectoryChapter leaderboard={data.leaderboard} />
          <ProofChapter />
          <FoundersChapter />
          <PartnersChapter />
          <PricingChapter />
          <ToolkitsChapter launched={data.launchedProducts} />
          <FaqChapter posts={data.blogPosts} />
          <FinaleChapter />
        </main>
      </HomeClient>
    </>
  );
}
