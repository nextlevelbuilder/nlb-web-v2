import { getPublishedProducts } from "@/lib/domain/catalog";
import { getLatestRankingSnapshot, computeRankingSnapshot } from "@/lib/domain/rankings";
import BuildWithUsClient, { type RankEntry } from "./build-with-us-client";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import ChapterPlate from "@/components/constellation/chapter-plate";
import { buildWithUsCopy } from "@/content/pages/build-with-us-copy";
import { toPageLocale } from "@/content/pages/page-locale";
import { pageMetadata } from "@/lib/seo";
import "./build-with-us.css";

// Reads D1 (products and ranking snapshots) on every request.
export const dynamic = "force-dynamic";

interface BuildWithUsProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}

/** Same bound as the client's MAX_QUERY_LENGTH (a "use client" module cannot export values to the server). */
const MAX_QUERY_LENGTH = 100;
const PLATE_COORD = "Polaris · RA 02h 31m · Dec +89° 15′";

/** Untrusted `?q=` (the WebSite SearchAction target): first value only, trimmed, at most 100 characters. */
function parseQuery(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim().slice(0, MAX_QUERY_LENGTH).trim() : "";
}

export async function generateMetadata({ params }: BuildWithUsProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "buildWithUs" });
  return pageMetadata({ title: t("heroTitle"), description: t("heroDesc"), path: "/build-with-us", locale });
}

export default async function BuildWithUsPage({ params, searchParams }: BuildWithUsProps) {
  const { locale } = await params;
  const initialQuery = parseQuery((await searchParams).q);
  const t = await getTranslations({ locale, namespace: "buildWithUs" });
  const copy = buildWithUsCopy[toPageLocale(locale)];
  const isMarkdown = (await headers()).get("x-nlb-markdown") === "1";
  // 1. Fetch published products
  const publishedProducts = await getPublishedProducts({ limit: 50 });

  // 2. Fetch or compute ranking snapshots
  let dailySnapshot = await getLatestRankingSnapshot("daily");
  if (!dailySnapshot && !isMarkdown) {
    try {
      dailySnapshot = await computeRankingSnapshot({ windowType: "daily" });
    } catch {
      // non-fatal
    }
  }

  let weeklySnapshot = await getLatestRankingSnapshot("weekly");
  if (!weeklySnapshot && !isMarkdown) {
    try {
      weeklySnapshot = await computeRankingSnapshot({ windowType: "weekly" });
    } catch {
      // non-fatal
    }
  }

  let monthlySnapshot = await getLatestRankingSnapshot("monthly");
  if (!monthlySnapshot && !isMarkdown) {
    try {
      monthlySnapshot = await computeRankingSnapshot({ windowType: "monthly" });
    } catch {
      // non-fatal
    }
  }

  return (
    <main id="main" className="bwu-page">
      <div className="wrap">
        <header className="page-head bwu-head">
          <ChapterPlate numeral="IV" name={t("plateName")} coord={PLATE_COORD} />
          <h1 className="h1-page">
            {t("headingLead")}<em>{t("headingAccent")}</em>
          </h1>
          <p className="lede">{t("heroDesc")}</p>
          <ul className="bwu-stats mono">
            <li><span className="bwu-stat-star" aria-hidden="true">✦</span>{copy.publishedCount(publishedProducts.length)}</li>
            <li><span className="bwu-stat-star" aria-hidden="true">✦</span>{t("statReview")}</li>
            <li><span className="bwu-stat-star" aria-hidden="true">✦</span>{t("statRanking")}</li>
          </ul>
        </header>

        <BuildWithUsClient
          locale={locale}
          initialQuery={initialQuery}
          initialProducts={publishedProducts}
          totalPublishedCount={publishedProducts.length}
          dailyRanks={toRankEntries(dailySnapshot?.ranks)}
          weeklyRanks={toRankEntries(weeklySnapshot?.ranks)}
          monthlyRanks={toRankEntries(monthlySnapshot?.ranks)}
        />
      </div>
    </main>
  );
}

/** Snapshot ranks are stored as JSON; keep only well-formed entries. */
function toRankEntries(ranks: unknown): RankEntry[] {
  if (!Array.isArray(ranks)) return [];
  return ranks.filter(
    (r): r is RankEntry =>
      typeof r === "object" && r !== null &&
      typeof (r as RankEntry).productId === "string" &&
      typeof (r as RankEntry).rank === "number" &&
      typeof (r as RankEntry).voteCount === "number",
  );
}
