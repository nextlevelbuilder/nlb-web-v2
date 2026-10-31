'use client';

import React, { useState, useMemo } from 'react';
import EditorialDisclosure from '@/components/editorial-disclosure';
import ProductLogo from '@/components/product-logo';
import { OrbitMotif } from '@/components/blocks/orbit-motif';
import { RealtimeTrafficCard } from '@/components/traffic/realtime-traffic-card';
import { Search, ArrowUpRight, ArrowRight, ThumbsUp, ExternalLink } from 'lucide-react';
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
  /** First mediaGallery image of the published document; null when the listing has none. */
  coverUrl?: string | null;
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
  /** Render the live traffic card; false when no traffic provider is configured, so it never polls a 503. */
  showLiveTraffic?: boolean;
  dailyRanks?: RankEntry[];
  weeklyRanks?: RankEntry[];
  monthlyRanks?: RankEntry[];
  /** Active locale; next-intl's client hook is not used so the component stays testable without a provider. */
  locale?: string;
  /** Search text from `?q=` (already trimmed and length-capped by the page). */
  initialQuery?: string;
}

type SortKey = 'trust' | 'votes' | 'newest';
type RankingWindow = 'today' | 'week' | 'month';
/** The subset of the Cloudflare Turnstile browser API this page calls. */
type TurnstileApi = {
  render: (selector: string, options: { sitekey: string; callback: (token: string) => void }) => void;
  getResponse: () => string | undefined;
};

const SORT_KEYS: readonly SortKey[] = ['trust', 'votes', 'newest'];
export const DIRECTORY_CATEGORIES = ['AI Agents', 'Developer Tools', 'Productivity', 'Cloud Infrastructure', 'Documentation'] as const;
export type DirectoryCategory = (typeof DIRECTORY_CATEGORIES)[number];
const CATEGORIES: ReadonlyArray<'All' | DirectoryCategory> = ['All', ...DIRECTORY_CATEGORIES];
/** Upper bound of the search text, shared with the page's `?q=` parsing. */
export const MAX_QUERY_LENGTH = 100;

/**
 * Keyword heuristic until products carry a category column: whole-word matches on title and tagline
 * (so "ai" does not match "maintain"). Cards show the same categories the filter uses.
 */
const CATEGORY_PATTERNS: Record<DirectoryCategory, RegExp> = {
  'AI Agents': /\bagents?\b|\bagentic\b|\bai\b/i,
  'Developer Tools': /\btools?\b|\btoolkits?\b|\bcli\b|\bframeworks?\b|\bsdk\b|\bmcp\b/i,
  Productivity: /\bworkflows?\b|\bautomation\b|\bautomate\b/i,
  'Cloud Infrastructure': /\bcloud\b|\bengines?\b|\bmicroservices?\b|\bedge\b/i,
  Documentation: /\bwiki\b|\bdocs?\b|\bdocumentation\b|\bmarkdown\b/i,
};

export function productCategories(product: Pick<ProductItem, 'title' | 'tagline'>): DirectoryCategory[] {
  const content = `${product.title} ${product.tagline}`;
  return DIRECTORY_CATEGORIES.filter((category) => CATEGORY_PATTERNS[category].test(content));
}

export function matchesQuery(product: Pick<ProductItem, 'title' | 'tagline' | 'slug'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [product.title, product.tagline, product.slug].some((field) => field.toLowerCase().includes(needle));
}

function getTurnstile(): TurnstileApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

export default function BuildWithUsClient({
  initialProducts,
  totalPublishedCount,
  showLiveTraffic = true,
  dailyRanks = [],
  weeklyRanks = [],
  monthlyRanks = [],
  locale = 'en',
  initialQuery = '',
}: BuildWithUsClientProps) {
  const t = useTranslations('buildWithUs');
  const pageLocale = toPageLocale(locale);
  const copy = buildWithUsCopy[pageLocale];
  // English is the unprefixed default locale (localePrefix 'as-needed').
  const localePrefix = pageLocale === 'vi' ? '/vi' : '';
  const directoryPath = `${localePrefix}/build-with-us`;
  const [searchQuery, setSearchQuery] = useState(initialQuery.slice(0, MAX_QUERY_LENGTH));
  const [selectedCategory, setSelectedCategory] = useState<'All' | DirectoryCategory>('All');
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

  /** Keep `?q=` in the address bar in sync so filtered views stay shareable (the form still works without JS). */
  const syncQueryToUrl = (query: string) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set('q', query.trim());
    else url.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    syncQueryToUrl(searchQuery);
  };

  const handleClearSearch = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setSearchQuery('');
    syncQueryToUrl('');
  };

  const filteredProducts = useMemo(() => {
    return initialProducts
      .map((product) => {
        const additionalVotes = votedMap[product.id] || 0;
        if (!additionalVotes) return product;
        const updatedProduct = { ...product, votesCount: product.votesCount + additionalVotes };
        return { ...updatedProduct, trustScore: calculateTrustScore(getProductTrustFactors(updatedProduct)) };
      })
      .filter((p) => matchesQuery(p, searchQuery) && (selectedCategory === 'All' || productCategories(p).includes(selectedCategory)))
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
  const trimmedQuery = searchQuery.trim();

  return (
    <div className="bwu-layout">
      <section aria-labelledby="bwu-catalog-title" className="bwu-main">
        <div className="bwu-controls">
          {/* Plain GET form: server-rendered with the `?q=` value, so search works before or without hydration. */}
          <form method="get" action={directoryPath} role="search" className="bwu-search" onSubmit={handleSearchSubmit}>
            <label htmlFor="bwu-search" className="mono bwu-label">{copy.searchLabel}</label>
            <div className="bwu-search-field">
              <Search aria-hidden className="bwu-search-icon" />
              <input
                id="bwu-search"
                name="q"
                type="search"
                maxLength={MAX_QUERY_LENGTH}
                autoComplete="off"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.slice(0, MAX_QUERY_LENGTH))}
              />
              <button type="submit" className="btn btn-primary btn-sm bwu-search-submit">{t('searchSubmit')}</button>
            </div>
          </form>
          <div className="bwu-sort">
            <label htmlFor="bwu-sort" className="mono bwu-label">{t('sortLabel')}</label>
            <select
              id="bwu-sort"
              value={sortBy}
              onChange={(e) => {
                const next = SORT_KEYS.find((key) => key === e.target.value);
                if (next) setSortBy(next);
              }}
            >
              <option value="trust">{t('highestTrust')}</option>
              <option value="votes">{t('mostUpvoted')}</option>
              <option value="newest">{t('newestLaunches')}</option>
            </select>
          </div>
        </div>

        <div className="bwu-filters">
          <div role="group" aria-label={copy.categoryGroupLabel} className="bwu-chip-row">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                aria-pressed={selectedCategory === cat}
                onClick={() => setSelectedCategory(cat)}
                className="bwu-chip"
              >
                {cat === 'All' ? t('all') : copy.categories[cat] ?? cat}
              </button>
            ))}
          </div>
          <div role="group" aria-label={copy.windowGroupLabel} className="seg bwu-window">
            {windows.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={rankingWindow === key}
                onClick={() => setRankingWindow(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="catalogue-head mono bwu-catalogue-head">
          <h2 id="bwu-catalog-title">{copy.catalogLabel}</h2>
          <span className="rule" aria-hidden="true" />
          <p aria-live="polite" className="bwu-count">
            {trimmedQuery
              ? t('searchResults', { count: filteredProducts.length, query: trimmedQuery })
              : t('catalogueHead', { count: filteredProducts.length })}
          </p>
          {trimmedQuery && (
            <a href={directoryPath} onClick={handleClearSearch} className="bwu-clear">{t('searchClear')}</a>
          )}
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bwu-empty">
            <OrbitMotif className="bwu-orbit bwu-empty-orbit" />
            <h3 className="bwu-empty-title">{t('noProductsTitle')}</h3>
            <p className="bwu-empty-text">{t('noProductsDesc')}</p>
            {trimmedQuery && (
              <a href={directoryPath} onClick={handleClearSearch} className="link-arrow">{t('searchClear')}</a>
            )}
          </div>
        ) : (
          <ul className="bwu-grid">
            {filteredProducts.map((p, index) => {
              const totalVotes = (rankMap.get(p.id)?.voteCount || 0) + (votedMap[p.id] || 0);
              const rank = rankMap.get(p.id)?.rank;
              const categories = productCategories(p);
              const href = `${localePrefix}/products/${p.slug}`;
              const created = new Date(p.createdAt);
              return (
                <li key={p.id} className={index === 0 ? 'bwu-item is-feature' : 'bwu-item'}>
                  <article className="bwu-card surface">
                    <div className="bwu-cover" aria-hidden="true">
                      {p.coverUrl ? (
                        <img src={p.coverUrl} alt="" width={1600} height={900} loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />
                      ) : (
                        <OrbitMotif className="bwu-orbit" />
                      )}
                    </div>
                    <div className="bwu-card-body">
                      <div className="bwu-card-id">
                        <span className="bwu-logo">
                          <ProductLogo src={p.logoUrl} name={p.title} imgWidth={44} imgHeight={44} imgClassName="bwu-logo-img" />
                        </span>
                        <div className="bwu-card-heading">
                          <h3 className="bwu-card-title">
                            <Link href={href} className="bwu-card-link">{p.title}</Link>
                          </h3>
                          <p className="bwu-card-meta mono">
                            <span>
                              {copy.launched}{' '}
                              <time dateTime={created.toISOString()}>{dateFormat.format(created)}</time>
                            </span>
                            {rank !== undefined && <span className="bwu-rank num-tab">{t('rank')} #{rank}</span>}
                          </p>
                        </div>
                      </div>
                      {p.isFeatured && (
                        <p className="badge bwu-pick" title={copy.editorsPickTitle}>✦ {copy.editorsPick}</p>
                      )}
                      <p className="bwu-card-tagline">{p.tagline}</p>
                      {categories.length > 0 && (
                        <ul className="bwu-tags">
                          {categories.map((category) => <li key={category}>{copy.categories[category] ?? category}</li>)}
                        </ul>
                      )}
                      <div className="bwu-card-foot">
                        <p className="bwu-trust mono">
                          {copy.trust} <strong className="bwu-trust-value num-tab">{p.trustScore}</strong>/100
                        </p>
                        <div className="bwu-card-actions">
                          <a href={`/go/${p.slug}`} target="_blank" rel="noopener noreferrer" className="bwu-visit">
                            {t('visitWebsite')}
                            <ExternalLink aria-hidden className="bwu-visit-icon" />
                            <span className="sr-only">{copy.opensInNewTab}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleVote(p.id)}
                            disabled={votingLoading[p.id]}
                            aria-label={copy.voteFor(p.title, totalVotes)}
                            aria-pressed={Boolean(votedMap[p.id])}
                            className="bwu-vote"
                          >
                            <ThumbsUp aria-hidden className="bwu-vote-icon" />
                            <span className="num-tab">{totalVotes}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        <EditorialDisclosure className="bwu-disclosure" />
      </section>

      <aside className="bwu-aside">
        {showLiveTraffic && <RealtimeTrafficCard />}

        <div className="surface bwu-panel bwu-panel-launch">
          <p className="eyebrow">{copy.publishedCount(totalPublishedCount)}</p>
          <h2 className="bwu-panel-title">{t('sidebarTitle')}</h2>
          <p className="bwu-panel-text">{t('sidebarDesc')}</p>
          <Link href={`${localePrefix}/studio`} className="btn btn-primary btn-sm bwu-panel-cta">
            {t('submitBtn')}
            <ArrowUpRight aria-hidden className="arrow" />
          </Link>
          <p className="mono bwu-panel-note">{t('trustGuarantee')}</p>
        </div>

        <div className="surface bwu-panel">
          <p className="mono bwu-panel-kicker">{copy.howToSubmitSubtitle}</p>
          <h2 className="bwu-panel-title">{copy.howToSubmitTitle}</h2>
          <p className="bwu-panel-text">{copy.howToSubmitDesc}</p>
          <a href="#guide" className="btn btn-ghost btn-sm bwu-panel-cta">
            {t('instructionsBtn')}
            <ArrowRight aria-hidden className="arrow" />
          </a>
        </div>

        {/* Cloudflare Turnstile invisible container */}
        <div id="cf-turnstile-widget" hidden />
      </aside>
    </div>
  );
}
