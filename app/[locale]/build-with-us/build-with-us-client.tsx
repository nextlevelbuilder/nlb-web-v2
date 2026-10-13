'use client';

import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import EditorialDisclosure from '@/components/editorial-disclosure';
import ProductLogo from '@/components/product-logo';
import { RealtimeTrafficCard } from '@/components/traffic/realtime-traffic-card';
import { Sparkles, Search, ArrowUpRight, ArrowRight, ShieldCheck, ThumbsUp, BookOpen, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { calculateTrustScore, getProductTrustFactors } from '@/lib/domain/trust';
import { buildWithUsCopy } from '@/content/pages/build-with-us-copy';
import { toPageLocale } from '@/content/pages/page-locale';

export interface ProductItem {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  websiteUrl: string;
  logoUrl?: string | null;
  trustScore: number;
  status: string;
  isFeatured: boolean;
  createdAt: string | Date;
  votesCount: number;
}

export type RankEntry = { productId: string; rank: number; voteCount: number };

export interface BuildWithUsClientProps {
  initialProducts: ProductItem[];
  totalPublishedCount: number;
  dailyRanks?: RankEntry[];
  weeklyRanks?: RankEntry[];
  monthlyRanks?: RankEntry[];
  /** Active locale; next-intl's client hook is not used so the component stays testable without a provider. */
  locale?: string;
}

type SortKey = 'trust' | 'votes' | 'newest';
type RankingWindow = 'today' | 'week' | 'month';
/** The subset of the Cloudflare Turnstile browser API this page calls. */
type TurnstileApi = {
  render: (selector: string, options: { sitekey: string; callback: (token: string) => void }) => void;
  getResponse: () => string | undefined;
};

const SORT_KEYS: readonly SortKey[] = ['trust', 'votes', 'newest'];
const CATEGORIES = ['All', 'AI Agents', 'Developer Tools', 'Productivity', 'Cloud Infrastructure', 'Documentation'];
const chipBase =
  'inline-flex min-h-10 items-center rounded-pill border px-3.5 text-step-xs transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const chipActive = 'border-primary bg-primary text-primary-foreground';
const chipIdle = 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-foreground';

function getTurnstile(): TurnstileApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

export default function BuildWithUsClient({
  initialProducts,
  totalPublishedCount,
  dailyRanks = [],
  weeklyRanks = [],
  monthlyRanks = [],
  locale = 'en',
}: BuildWithUsClientProps) {
  const t = useTranslations('buildWithUs');
  const pageLocale = toPageLocale(locale);
  const copy = buildWithUsCopy[pageLocale];
  // English is the unprefixed default locale (localePrefix 'as-needed').
  const localePrefix = pageLocale === 'vi' ? '/vi' : '';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState<SortKey>('trust');
  const [rankingWindow, setRankingWindow] = useState<RankingWindow>('today');
  const [votedMap, setVotedMap] = useState<Record<string, number>>({});
  const [votingLoading, setVotingLoading] = useState<Record<string, boolean>>({});
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAEkxy_i73Qse_pPB';

  React.useEffect(() => {
    if (typeof window !== 'undefined' && !document.getElementById('turnstile-script')) {
      const script = document.createElement('script');
      script.id = 'turnstile-script';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        const turnstile = getTurnstile();
        if (turnstile && document.getElementById('cf-turnstile-widget')) {
          try {
            turnstile.render('#cf-turnstile-widget', {
              sitekey: turnstileSiteKey,
              callback: (token: string) => setTurnstileToken(token),
            });
          } catch (error) {
            // Voting still works without a token when the server does not require one.
            console.warn('Turnstile render failed:', error);
          }
        }
      };
      document.head.appendChild(script);
    }
  }, [turnstileSiteKey]);

  const activeRanks = useMemo(() => {
    if (rankingWindow === 'today') return dailyRanks;
    if (rankingWindow === 'week') return weeklyRanks;
    return monthlyRanks;
  }, [rankingWindow, dailyRanks, weeklyRanks, monthlyRanks]);

  const rankMap = useMemo(() => {
    const map = new Map<string, { rank: number; voteCount: number }>();
    activeRanks.forEach((r) => map.set(r.productId, r));
    return map;
  }, [activeRanks]);

  // Live upvoting with Turnstile protection; signed-out visitors go to sign-in and come back here.
  const handleVote = async (productId: string) => {
    setVotingLoading((prev) => ({ ...prev, [productId]: true }));
    try {
      let token = turnstileToken;
      try {
        const response = getTurnstile()?.getResponse();
        if (response) token = response;
      } catch {
        // getResponse throws before the widget renders; fall back to the callback token.
      }

      const res = await fetch('/api/v1/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, turnstileToken: token || undefined }),
      });

      if (res.ok) {
        setVotedMap((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
      } else if (res.status === 401) {
        window.location.href = `${localePrefix}/sign-in?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      }
    } catch (e) {
      console.error('Failed to vote:', e);
    } finally {
      setVotingLoading((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const filteredProducts = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return initialProducts
      .map((product) => {
        const additionalVotes = votedMap[product.id] || 0;
        if (!additionalVotes) return product;
        const updatedProduct = { ...product, votesCount: product.votesCount + additionalVotes };
        return { ...updatedProduct, trustScore: calculateTrustScore(getProductTrustFactors(updatedProduct)) };
      })
      .filter((p) => {
        const matchesSearch =
          p.title.toLowerCase().includes(query) || p.tagline.toLowerCase().includes(query) || p.slug.toLowerCase().includes(query);
        if (selectedCategory === 'All') return matchesSearch;

        // Simple keyword heuristic; products carry no category column yet.
        const content = `${p.title} ${p.tagline}`.toLowerCase();
        if (selectedCategory === 'AI Agents') return matchesSearch && (content.includes('agent') || content.includes('ai'));
        if (selectedCategory === 'Developer Tools') return matchesSearch && (content.includes('tool') || content.includes('cli') || content.includes('framework'));
        if (selectedCategory === 'Productivity') return matchesSearch && (content.includes('workflow') || content.includes('automation'));
        if (selectedCategory === 'Cloud Infrastructure') return matchesSearch && (content.includes('cloud') || content.includes('engine') || content.includes('microservice'));
        if (selectedCategory === 'Documentation') return matchesSearch && (content.includes('wiki') || content.includes('doc'));
        return matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'trust') return (b.trustScore || 0) - (a.trustScore || 0);
        if (sortBy === 'votes') {
          const votesA = (rankMap.get(a.id)?.voteCount || 0) + (votedMap[a.id] || 0);
          const votesB = (rankMap.get(b.id)?.voteCount || 0) + (votedMap[b.id] || 0);
          return votesB - votesA;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [initialProducts, searchQuery, selectedCategory, sortBy, rankMap, votedMap]);

  const dateFormat = new Intl.DateTimeFormat(pageLocale === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'medium', timeZone: 'UTC' });
  const windows: Array<[RankingWindow, string]> = [['today', t('today')], ['week', t('thisWeek')], ['month', t('thisMonth')]];

  return (
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12">
      <section aria-labelledby="bwu-catalog-title" className="min-w-0 space-y-8 lg:col-span-8">
        <h2 id="bwu-catalog-title" className="sr-only">{copy.catalogLabel}</h2>
        <div className="space-y-4">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <div className="relative flex-1">
              <label htmlFor="bwu-search" className="mono-label mb-2 block text-ink-3">{copy.searchLabel}</label>
              <Search aria-hidden className="pointer-events-none absolute bottom-3.5 left-3.5 h-4 w-4 text-ink-3" />
              <input
                id="bwu-search"
                type="search"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-sm border border-input bg-surface pl-10 pr-4 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="shrink-0">
              <label htmlFor="bwu-sort" className="mono-label mb-2 block text-ink-3">{t('sort').replace(/:\s*$/, '')}</label>
              <select
                id="bwu-sort"
                value={sortBy}
                onChange={(e) => {
                  const next = SORT_KEYS.find((key) => key === e.target.value);
                  if (next) setSortBy(next);
                }}
                className="h-11 w-full rounded-sm border border-input bg-surface px-3 text-step-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
              >
                <option value="trust">{t('highestTrust')}</option>
                <option value="votes">{t('mostUpvoted')}</option>
                <option value="newest">{t('newestLaunches')}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div role="group" aria-label={copy.categoryGroupLabel} className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`${chipBase} ${selectedCategory === cat ? chipActive : chipIdle}`}
                >
                  {cat === 'All' ? t('all') : copy.categories[cat] ?? cat}
                </button>
              ))}
            </div>
            <div role="group" aria-label={copy.windowGroupLabel} className="seg">
              {windows.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={rankingWindow === key}
                  onClick={() => setRankingWindow(key)}
                  className="seg-option min-h-10"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <EditorialDisclosure />

        {filteredProducts.length === 0 ? (
          <div className="surface-panel space-y-3 px-6 py-16 text-center">
            <ShieldCheck aria-hidden className="mx-auto h-10 w-10 text-ink-3" strokeWidth={1.25} />
            <h2 className="font-display text-step-xl font-light">{t('noProductsTitle')}</h2>
            <p className="mx-auto max-w-sm text-step-sm text-ink-2">{t('noProductsDesc')}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {filteredProducts.map((p) => {
              const totalVotes = (rankMap.get(p.id)?.voteCount || 0) + (votedMap[p.id] || 0);
              return (
                <li
                  key={p.id}
                  className="group flex flex-col justify-between rounded-sm border border-line bg-surface p-6 transition-colors duration-base hover:border-line-strong"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <Link
                          href={`${localePrefix}/products/${p.slug}`}
                          aria-hidden
                          tabIndex={-1}
                          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-surface-raised text-primary"
                        >
                          <ProductLogo src={p.logoUrl} name={p.title} />
                        </Link>
                        <div className="min-w-0">
                          <h3 className="font-display text-step-lg leading-tight">
                            <Link
                              href={`${localePrefix}/products/${p.slug}`}
                              className="rounded-sm break-words hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {p.title}
                            </Link>
                          </h3>
                          <p className="mt-1 font-mono text-step-xs text-ink-3">
                            {copy.launched}{' '}
                            <time dateTime={new Date(p.createdAt).toISOString()}>{dateFormat.format(new Date(p.createdAt))}</time>
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 font-mono">
                        {copy.trust}: <strong className="text-foreground ml-1">{p.trustScore}</strong>/100
                      </Badge>
                    </div>
                    {p.isFeatured && (
                      <Badge variant="secondary" title={copy.editorsPickTitle} className="gap-1">
                        <Sparkles aria-hidden className="h-3 w-3" />
                        {copy.editorsPick}
                      </Badge>
                    )}
                    <p className="line-clamp-2 text-step-sm leading-relaxed text-ink-2">{p.tagline}</p>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <div className="flex flex-wrap items-center gap-4 text-step-xs">
                      <Link href={`${localePrefix}/products/${p.slug}`} className="link-arrow">
                        {t('viewDetails')}
                        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                      </Link>
                      <a
                        href={`/go/${p.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-ink-2 underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {t('visitWebsite')}
                        <ExternalLink aria-hidden className="h-3 w-3" />
                        <span className="sr-only">{copy.opensInNewTab}</span>
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleVote(p.id)}
                      disabled={votingLoading[p.id]}
                      aria-label={copy.voteFor(p.title, totalVotes)}
                      aria-pressed={Boolean(votedMap[p.id])}
                      className={`${chipBase} gap-1.5 font-mono disabled:opacity-60 ${votedMap[p.id] ? chipActive : chipIdle}`}
                    >
                      <ThumbsUp aria-hidden className="h-3.5 w-3.5" />
                      <span>{totalVotes}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="min-w-0 space-y-6 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:col-span-4">
        <RealtimeTrafficCard />

        <div className="surface-panel space-y-4 p-6">
          <p className="eyebrow">{copy.publishedCount(totalPublishedCount)}</p>
          <h2 className="font-display text-step-xl font-light">{t('sidebarTitle')}</h2>
          <p className="text-step-sm leading-relaxed text-ink-2">{t('sidebarDesc')}</p>
          <Button asChild className="w-full gap-2">
            <Link href={`${localePrefix}/studio`}>
              {t('submitBtn')}
              <ArrowUpRight aria-hidden className="h-4 w-4" />
            </Link>
          </Button>
          <p className="mono-label text-ink-3">{t('trustGuarantee')}</p>
        </div>

        <div className="surface-panel space-y-4 p-6">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-sm border border-line text-primary">
              <BookOpen className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-step-base font-medium text-foreground">{copy.howToSubmitTitle}</h2>
              <p className="mono-label text-ink-3">{copy.howToSubmitSubtitle}</p>
            </div>
          </div>
          <p className="text-step-sm leading-relaxed text-ink-2">{copy.howToSubmitDesc}</p>
          <Button asChild variant="outline" className="w-full gap-1.5">
            <Link href={`${localePrefix}/build-with-us/instructions`}>
              {t('instructionsBtn')}
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {/* Cloudflare Turnstile invisible container */}
        <div id="cf-turnstile-widget" className="hidden" />
      </aside>
    </div>
  );
}
