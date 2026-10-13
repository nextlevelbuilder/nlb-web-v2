'use client';

import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import EditorialDisclosure from '@/components/editorial-disclosure';
import ProductLogo from '@/components/product-logo';
import { RealtimeTrafficCard } from '@/components/traffic/realtime-traffic-card';
import {
  Sparkles,
  Search,
  Filter,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  ThumbsUp,
  Award,
  Zap,
  BookOpen,
  Activity,
  Users,
  Eye,
  ExternalLink,
  Flame,
  Calendar,
  Clock,
  Layers,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { calculateTrustScore, getProductTrustFactors } from '@/lib/domain/trust';
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

export interface BuildWithUsClientProps {
  initialProducts: ProductItem[];
  totalPublishedCount: number;
  dailyRanks?: Array<{ productId: string; rank: number; voteCount: number }>;
  weeklyRanks?: Array<{ productId: string; rank: number; voteCount: number }>;
  monthlyRanks?: Array<{ productId: string; rank: number; voteCount: number }>;
}

export default function BuildWithUsClient({
  initialProducts,
  totalPublishedCount,
  dailyRanks = [],
  weeklyRanks = [],
  monthlyRanks = [],
}: BuildWithUsClientProps) {
  const t = useTranslations('buildWithUs');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState<'trust' | 'votes' | 'newest'>('trust');
  const [rankingWindow, setRankingWindow] = useState<'today' | 'week' | 'month'>('today');
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
        if ((window as any).turnstile && document.getElementById('cf-turnstile-widget')) {
          try {
            (window as any).turnstile.render('#cf-turnstile-widget', {
              sitekey: turnstileSiteKey,
              callback: (token: string) => setTurnstileToken(token),
            });
          } catch {
            // ignore
          }
        }
      };
      document.head.appendChild(script);
    }
  }, [turnstileSiteKey]);

  const categories = [
    'All',
    'AI Agents',
    'Developer Tools',
    'Productivity',
    'Cloud Infrastructure',
    'Documentation',
  ];
  // Map votes from rankings snapshot
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

  // Handle live upvoting
  // Handle live upvoting with Turnstile protection
  const handleVote = async (productId: string, slug: string) => {
    setVotingLoading((prev) => ({ ...prev, [productId]: true }));
    try {
      let token = turnstileToken;
      if (typeof window !== 'undefined' && (window as any).turnstile) {
        try {
          const res = (window as any).turnstile.getResponse();
          if (res) token = res;
        } catch {
          // ignore
        }
      }

      const res = await fetch('/api/v1/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, turnstileToken: token || undefined }),
      });

      if (res.ok) {
        setVotedMap((prev) => ({
          ...prev,
          [productId]: (prev[productId] || 0) + 1,
        }));
      } else if (res.status === 401) {
        window.location.href = '/api/auth/signin';
      }
    } catch (e) {
      console.error('Failed to vote:', e);
    } finally {
      setVotingLoading((prev) => ({ ...prev, [productId]: false }));
    }
  };

  // Filter and Sort Products
  const filteredProducts = useMemo(() => {
    return initialProducts
      .map((product) => {
        const additionalVotes = votedMap[product.id] || 0;
        if (!additionalVotes) return product;
        const updatedProduct = { ...product, votesCount: product.votesCount + additionalVotes };
        return {
          ...updatedProduct,
          trustScore: calculateTrustScore(getProductTrustFactors(updatedProduct)),
        };
      })
      .filter((p) => {
        const matchesSearch =
          p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.slug.toLowerCase().includes(searchQuery.toLowerCase());

        if (selectedCategory === 'All') return matchesSearch;

        // Simple heuristic matching for category tags
        const content = `${p.title} ${p.tagline}`.toLowerCase();
        if (selectedCategory === 'AI Agents') return matchesSearch && (content.includes('agent') || content.includes('ai'));
        if (selectedCategory === 'Developer Tools') return matchesSearch && (content.includes('tool') || content.includes('cli') || content.includes('framework'));
        if (selectedCategory === 'Productivity') return matchesSearch && (content.includes('workflow') || content.includes('automation'));
        if (selectedCategory === 'Cloud Infrastructure') return matchesSearch && (content.includes('cloud') || content.includes('engine') || content.includes('microservice'));
        if (selectedCategory === 'Documentation') return matchesSearch && (content.includes('wiki') || content.includes('doc'));

        return matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'trust') {
          return (b.trustScore || 0) - (a.trustScore || 0);
        }
        if (sortBy === 'votes') {
          const votesA = (rankMap.get(a.id)?.voteCount || 0) + (votedMap[a.id] || 0);
          const votesB = (rankMap.get(b.id)?.voteCount || 0) + (votedMap[b.id] || 0);
          return votesB - votesA;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [initialProducts, searchQuery, selectedCategory, sortBy, rankMap, votedMap]);

  // Early Birds 100 slots computation
  const maxEarlyBirdSlots = 100;
  const isEarlyBirdActive = totalPublishedCount < maxEarlyBirdSlots;
  const remainingSlots = Math.max(maxEarlyBirdSlots - totalPublishedCount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Main Content Area (8 Cols on Desktop) */}
      <div className="lg:col-span-8 space-y-8">
        {/* Search, Filter & Sort Controls */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white/[0.04] border border-white/10 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary text-sm shadow-inner"
              />
            </div>

            {/* Sort Select */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                {t('sort')}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="trust" className="bg-neutral-900">{t('highestTrust')}</option>
                <option value="votes" className="bg-neutral-900">{t('mostUpvoted')}</option>
                <option value="newest" className="bg-neutral-900">{t('newestLaunches')}</option>
              </select>
            </div>
          </div>

          {/* Category Filter Chips & Ranking Windows */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs px-3.5 py-1.5 rounded-full transition-all duration-200 border ${
                    selectedCategory === cat
                      ? 'bg-primary text-primary-foreground border-primary font-semibold shadow-md shadow-primary/20'
                      : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/10 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat === 'All' ? t('all') : cat}
                </button>
              ))}
            </div>

            {/* Timeframe Ranking Filter */}
            <div className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
              <button
                onClick={() => setRankingWindow('today')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rankingWindow === 'today'
                    ? 'bg-primary/20 text-primary font-bold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('today')}
              </button>
              <button
                onClick={() => setRankingWindow('week')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rankingWindow === 'week'
                    ? 'bg-primary/20 text-primary font-bold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('thisWeek')}
              </button>
              <button
                onClick={() => setRankingWindow('month')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rankingWindow === 'month'
                    ? 'bg-primary/20 text-primary font-bold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('thisMonth')}
              </button>
            </div>
          </div>
        </div>

        {/* Editorial Disclosure */}
        <EditorialDisclosure />

        {/* Product Listing Cards */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 rounded-3xl border border-white/10 bg-white/[0.01] space-y-3">
            <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto opacity-40" />
            <h3 className="text-lg font-bold">{t('noProductsTitle')}</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {t('noProductsDesc')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredProducts.map((p, idx) => {
              const rankInfo = rankMap.get(p.id);
              const totalVotes = (rankInfo?.voteCount || 0) + (votedMap[p.id] || 0);

              return (
                <Card
                  key={p.id}
                  className="p-6 bg-white/[0.02] hover:bg-white/[0.04] border-white/10 hover:border-primary/40 transition-all rounded-3xl flex flex-col justify-between group relative overflow-hidden shadow-lg"
                >
                  <div className="space-y-4">
                    {/* Header Row: Logo, Title, Rank & Verified Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <Link
                          href={`/products/${p.slug}`}
                          aria-label={p.title}
                          className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-lg text-primary overflow-hidden shrink-0 group-hover:scale-105 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          <ProductLogo src={p.logoUrl} name={p.title} />
                        </Link>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
                              <Link
                                href={`/products/${p.slug}`}
                                className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded"
                              >
                                {p.title}
                              </Link>
                            </h3>
                            {p.isFeatured && (
                              <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary px-1.5 py-0.5" title="Editorially curated based on product quality and community relevance">
                                <Sparkles className="w-2.5 h-2.5 mr-0.5 inline" />
                                Editor's Pick
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Verified Launch
                          </span>
                        </div>
                      </div>

                      {/* Trust Score Chip */}
                      <Badge variant="outline" className="text-xs font-mono border-white/10 bg-white/5 shrink-0">
                        Trust: <strong className="text-foreground ml-1">{p.trustScore}</strong>/100
                      </Badge>
                    </div>

                    {/* Tagline */}
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {p.tagline}
                    </p>
                  </div>

                  {/* Footer Row: Outbound Link, Product Link & Upvote Action */}
                  <div className="flex items-center justify-between pt-4 mt-5 border-t border-white/5">
                    <div className="flex items-center gap-3 text-xs">
                      <Link
                        href={`/products/${p.slug}`}
                        className="text-foreground hover:text-primary font-medium hover:underline flex items-center gap-1"
                      >
                        {t('viewDetails')}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>

                      <Link
                        href={`/go/${p.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {t('visitWebsite')}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>

                    {/* Upvote Button */}
                    <button
                      onClick={() => handleVote(p.id, p.slug)}
                      disabled={votingLoading[p.id]}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        votedMap[p.id]
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30'
                          : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span>{totalVotes}</span>
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Right Sidebar (4 Cols on Desktop) */}
      <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-28">
        <RealtimeTrafficCard />
        {/* Early Birds 100 Slots Card */}
        {isEarlyBirdActive && (
          <Card className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/15 via-primary/10 to-primary/20 border border-amber-500/30 space-y-4 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between">
              <Badge className="bg-amber-500 text-black font-bold text-xs gap-1 shadow-md">
                <Flame className="w-3.5 h-3.5 fill-black" />
                Early Birds Special
              </Badge>
              <span className="text-xs font-mono font-bold text-amber-400">
                {remainingSlots} / {maxEarlyBirdSlots} Slots Left
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-foreground">$24.50</span>
                <span className="text-sm line-through text-muted-foreground font-mono">$49 regular</span>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] font-bold ml-1">50% OFF</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                First 100 builders get a <strong>50% OFF discount</strong> ($24.50 instead of $49) on the <strong>NLB Studio Publishing Toolkit</strong>. Compose schema-validated product pages, manage assets, and launch with structured developer tooling.
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden border border-white/5">
              <div
                className="bg-gradient-to-r from-amber-400 to-primary h-full transition-all duration-500"
                style={{ width: `${Math.min((totalPublishedCount / maxEarlyBirdSlots) * 100, 100)}%` }}
              />
            </div>

            <Button asChild className="w-full rounded-full gap-2 font-bold shadow-lg btn-premium">
              <Link href="/studio">
                Claim 50% Off Studio Toolkit
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>
        )}

        {/* Regular CTA Card if Early Birds Expired */}
        {!isEarlyBirdActive && (
          <Card className="p-6 rounded-3xl bg-white/[0.02] border-white/10 space-y-4 shadow-lg">
            <h3 className="font-bold text-lg">Submit Your Product</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use NLB Studio to compose schema-validated listings, manage launch media assets, and publish verified developer documentation.
            </p>
            <Button asChild className="w-full rounded-full gap-2 font-bold btn-premium">
              <Link href="/studio">
                Launch in Studio ($49)
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>
        )}

        {/* Submission Instructions Card */}
        <Card className="p-6 rounded-3xl bg-white/[0.02] border-white/10 space-y-4 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-foreground">How to Submit</h4>
              <p className="text-[10px] text-muted-foreground">Web, CLI, or AI Agents</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Choose from 4 easy publishing workflows: Interactive Web Studio, CLI package, MCP server for AI IDEs, or direct REST APIs.
          </p>

          <Button asChild variant="outline" size="sm" className="w-full rounded-full text-xs gap-1.5 border-white/10">
            <Link href="/build-with-us/instructions">
              {t('instructionsBtn')}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </Card>

        {/* Cloudflare Turnstile Invisible Container */}
        <div id="cf-turnstile-widget" className="hidden" />
      </div>
    </div>
  );
}
