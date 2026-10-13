import React from "react";
import { getPublishedProducts } from "@/lib/domain/catalog";
import { getLatestRankingSnapshot, computeRankingSnapshot } from "@/lib/domain/rankings";
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import BuildWithUsClient from "./build-with-us-client";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { pageMetadata } from "@/lib/seo";

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
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Navbar />

      <div className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-12">
          {/* Hero Header */}
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <Badge variant="outline" className="text-xs font-semibold px-3 py-1 border-primary/40 bg-primary/10 text-primary gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {t('heroBadge')}
            </Badge>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              {t('heroTitle')}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              {t('heroDesc')}
            </p>
          </div>

          {/* Interactive Hub with Sticky Right Sidebar */}
          <BuildWithUsClient
            initialProducts={publishedProducts}
            totalPublishedCount={publishedProducts.length}
            dailyRanks={(dailySnapshot?.ranks as any) || []}
            weeklyRanks={(weeklySnapshot?.ranks as any) || []}
            monthlyRanks={(monthlySnapshot?.ranks as any) || []}
          />
        </div>
      </div>

      <FooterSection />
    </div>
  );
}
