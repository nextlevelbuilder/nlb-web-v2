import React from "react";
import { getPublishedProducts } from "@/lib/domain/catalog";
import { getLatestRankingSnapshot, computeRankingSnapshot } from "@/lib/domain/rankings";
import { Card } from "@/components/ui/card";
import ProductLogo from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, ThumbsUp, ArrowUpRight, ShieldCheck, Hash } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { pageMetadata } from "@/lib/seo";

interface LeaderboardsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: LeaderboardsPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "leaderboards" });
  return pageMetadata({ title: t("title"), description: t("desc"), path: "/leaderboards", locale });
}
interface RankedProductItem {
  rank: number;
  productId: string;
  voteCount: number;
  score: number;
}

export default async function LeaderboardsPage({ params }: LeaderboardsPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "leaderboards" });
  let dailySnapshot = await getLatestRankingSnapshot("daily");
  if (!dailySnapshot && (await headers()).get("x-nlb-markdown") !== "1") {
    dailySnapshot = await computeRankingSnapshot({ windowType: "daily" });
  }

  const publishedProducts = await getPublishedProducts({ limit: 50 });
  const productMap = new Map(publishedProducts.map((p) => [p.id, p]));

  const rankedItems = (dailySnapshot?.ranks as RankedProductItem[]) || [];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Navbar />
      <div className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary gap-1.5 px-3 py-1">
            <Trophy className="w-4 h-4 text-primary" />
            {t('badge')}
          </Badge>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('desc')}
          </p>

          {dailySnapshot && (
            <div className="flex items-center justify-center gap-4 text-xs font-mono text-muted-foreground pt-2">
              <span>{t('date')} {dailySnapshot.windowDate}</span>
              <span>•</span>
              <span>{t('ruleset')} {dailySnapshot.rulesetVersion}</span>
              <span>•</span>
              <span className="flex items-center gap-1" title={dailySnapshot.snapshotHash}>
                <Hash className="w-3 h-3 text-primary" />
                {t('auditHash')} {dailySnapshot.snapshotHash.slice(0, 12)}…
              </span>
            </div>
          )}
        </div>

        {/* Leaderboard Table / Cards */}
        {rankedItems.length === 0 ? (
          <div className="text-center py-20 border border-white/10 rounded-2xl bg-white/[0.02]">
            <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <h3 className="text-lg font-bold">{t('noRankingsTitle')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('noRankingsDesc')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {rankedItems.map((item) => {
              const product = productMap.get(item.productId);
              if (!product) return null;

              return (
                <Card
                  key={item.productId}
                  className="flex items-center justify-between p-5 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-primary/40 hover:bg-white/[0.04] transition-all"
                >
                  <div className="flex items-center gap-5">
                    <div
                      className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center text-lg shrink-0 ${
                        item.rank === 1
                          ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/40 shadow-lg shadow-yellow-500/10"
                          : item.rank === 2
                          ? "bg-slate-300/20 text-slate-300 border border-slate-300/40"
                          : item.rank === 3
                          ? "bg-amber-700/20 text-amber-600 border border-amber-700/40"
                          : "bg-white/5 text-muted-foreground border border-white/10"
                      }`}
                    >
                      #{item.rank}
                    </div>

                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-lg text-primary overflow-hidden shrink-0">
                      <ProductLogo src={product.logoUrl} name={product.title} />
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-foreground hover:text-primary transition-colors">
                        <Link href={`/products/${product.slug}`}>{product.title}</Link>
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-1">{product.tagline}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-xs px-3 py-1 bg-primary/5 border-primary/20 text-primary gap-1">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      {item.voteCount} {t('votes')} ({item.score} pts)
                    </Badge>
                    <Link
                      href={`/go/${product.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                      title="Visit site"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      </div>
      <FooterSection />
    </div>
  );
}
