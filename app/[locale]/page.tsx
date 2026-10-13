import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import { defaultLocale, isLocale, locales } from "@/i18n/routing";
import { MEMBERSHIP_PLANS, MEMBERSHIP_PRICES } from "@/lib/constants/launch";
import { loadHomePageData } from "@/lib/home/home-page-data";
import { pageMetadata, serializeJsonLd, siteUrl } from "@/lib/seo";
import FooterSection from "@/components/sections/footer-section";
import HeroSection from "@/components/sections/hero-section";
import TheDarkSection from "@/components/sections/the-dark-section";
import CommunitySection from "@/components/sections/community-section";
import CoursesSection from "@/components/sections/courses-section";
import DirectorySection from "@/components/sections/directory-section";
import ProofSection from "@/components/sections/proof-section";
import TeamSection from "@/components/sections/team-section";
import PartnersSection from "@/components/sections/partners-section";
import PricingSection from "@/components/sections/pricing-section";
import BuildWithAgentKitSection from "@/components/sections/build-with-agentkit-section";
import CTASection from "@/components/sections/cta-section";
import HomeClient from "./home-client";

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
    name: `Next Level Builders ${plan === "vip" ? "VIP" : "Premium"} membership`,
    brand: { "@id": `${siteUrl()}/#org` },
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

export default async function Home({ params }: { params: Params }) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);
  const data = await loadHomePageData();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(membershipJsonLd(locale)) }} />
      <HomeClient productIds={data.productIds} seats={data.seats} activity={data.activity}>
        <main id="main">
          <HeroSection />
          <TheDarkSection />
          <CommunitySection />
          <CoursesSection />
          <DirectorySection />
          <ProofSection />
          <TeamSection />
          <PartnersSection />
          <PricingSection />
          <BuildWithAgentKitSection launchedProducts={data.launchedProducts} />
          <CTASection />
        </main>
      </HomeClient>
      <FooterSection />
    </>
  );
}
