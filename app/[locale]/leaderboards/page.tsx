import { getPublishedProducts } from "@/lib/domain/catalog";
import { getLatestRankingSnapshot, computeRankingSnapshot } from "@/lib/domain/rankings";
import ProductLogo from "@/components/product-logo";
import { Trophy, TrendingUp, ThumbsUp, ArrowUpRight, Hash } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { directoryCopy } from "@/content/pages/directory-copy";
import { toPageLocale } from "@/content/pages/page-locale";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { pageMetadata } from "@/lib/seo";
import { BuilderBoardsTab } from "@/components/builder-league/leaderboard/builder-boards-tab";

// Reads (and may compute) ranking snapshots in D1; never prerender at build time.
export const dynamic = "force-dynamic";

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
  // Only ranks whose product is still published are shown.
  const visibleItems = rankedItems.flatMap((item) => {
    const product = productMap.get(item.productId);
    return product ? [{ item, product }] : [];
  });
  const copy = directoryCopy[toPageLocale(locale)];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-4xl space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <header className="space-y-5">
            <p className="eyebrow">
              <Trophy aria-hidden className="h-3.5 w-3.5 text-primary" />
              {t('badge')}
            </p>
            <h1 className="font-display text-step-3xl font-light">{t('title')}</h1>
            <p className="lede max-w-[60ch]">{t('desc')}</p>

            {dailySnapshot && (
              <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 font-mono text-step-xs text-ink-3">
                <div className="flex gap-1.5">
                  <dt>{t('date')}</dt>
                  <dd className="text-ink-2">{dailySnapshot.windowDate}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>{t('ruleset')}</dt>
                  <dd className="text-ink-2">{dailySnapshot.rulesetVersion}</dd>
                </div>
                <div className="flex min-w-0 gap-1.5" title={dailySnapshot.snapshotHash}>
                  <dt className="flex items-center gap-1">
                    <Hash aria-hidden className="h-3 w-3 text-primary" />
                    {t('auditHash')}
                  </dt>
                  <dd className="text-ink-2">{dailySnapshot.snapshotHash.slice(0, 12)}…</dd>
                </div>
              </dl>
            )}
          </header>

          <BuilderBoardsTab locale={locale} />

          {visibleItems.length === 0 ? (
            <div className="surface-panel px-6 py-16 text-center">
              <TrendingUp aria-hidden className="mx-auto mb-4 h-10 w-10 text-ink-3" strokeWidth={1.25} />
              <h2 className="font-display text-step-xl font-normal">{t('noRankingsTitle')}</h2>
              <p className="mt-2 text-step-sm text-ink-2">{t('noRankingsDesc')}</p>
            </div>
          ) : (
            <ol className="surface-panel divide-y divide-line">
              {visibleItems.map(({ item, product }) => (
                <li
                  key={item.productId}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 transition-colors duration-base hover:bg-primary/5 sm:grid-cols-[2.5rem_3rem_minmax(0,1fr)_auto] sm:p-5"
                >
                  <span
                    aria-label={copy.rankLabel(item.rank)}
                    className={`text-center font-display text-step-xl italic leading-none ${item.rank <= 3 ? "text-primary" : "text-ink-3"}`}
                  >
                    {item.rank}
                  </span>

                  <div className="hidden h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-background font-display text-lg text-primary sm:flex">
                    <ProductLogo src={product.logoUrl} name={product.title} />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-step-base font-medium">
                      <Link href={`/products/${product.slug}`} className="hover:text-primary hover:underline hover:underline-offset-4">
                        {product.title}
                      </Link>
                    </h2>
                    <p className="truncate text-step-sm text-ink-2">{product.tagline}</p>
                  </div>

                  <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
                    <p className="flex items-center gap-1.5 font-mono text-step-xs text-ink-2">
                      <ThumbsUp aria-hidden className="h-3.5 w-3.5 text-primary" />
                      {copy.votes(item.voteCount)} · {copy.points(item.score)}
                    </p>
                    <a
                      href={`/go/${product.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${copy.visitSite(product.title)} ${copy.opensInNewTab}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-pill border border-line-strong text-ink-2 transition-colors hover:border-foreground hover:text-foreground"
                    >
                      <ArrowUpRight aria-hidden className="h-4 w-4" />
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
    </div>
  );
}
