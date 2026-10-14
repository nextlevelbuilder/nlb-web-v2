import { getPublishedProducts } from "@/lib/domain/catalog";
import { getLatestRankingSnapshot, computeRankingSnapshot } from "@/lib/domain/rankings";
import BuildWithUsClient, { type RankEntry } from "./build-with-us-client";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { pageMetadata } from "@/lib/seo";

// Reads D1 (products and ranking snapshots) on every request.
export const dynamic = "force-dynamic";

interface BuildWithUsProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: BuildWithUsProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "buildWithUs" });
  return pageMetadata({ title: t("heroTitle"), description: t("heroDesc"), path: "/build-with-us", locale });
}

export default async function BuildWithUsPage({ params }: BuildWithUsProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "buildWithUs" });
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)] md:pt-[calc(var(--header-h)+4.5rem)]">
          <header className="max-w-3xl space-y-5">
            <p className="eyebrow">{t("heroBadge")}</p>
            <h1 className="h-display">{t("heroTitle")}</h1>
            <p className="lede">{t("heroDesc")}</p>
          </header>

          <BuildWithUsClient
            locale={locale}
            initialProducts={publishedProducts}
            totalPublishedCount={publishedProducts.length}
            dailyRanks={toRankEntries(dailySnapshot?.ranks)}
            weeklyRanks={toRankEntries(weeklySnapshot?.ranks)}
            monthlyRanks={toRankEntries(monthlySnapshot?.ranks)}
          />
        </div>
      </main>
    </div>
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
