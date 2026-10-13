'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import ProductLogo from '@/components/product-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Layers,
  Globe,
  Award,
  MousePointerClick,
  Users,
  Box,
  ThumbsUp,
  Activity,
} from 'lucide-react';
import Link from 'next/link';

interface DirectoryStats {
  publishedCount: number;
  outboundClicks: number;
  registeredBuilders: number;
  totalVotes: number;
}

export default function BuildWithAgentKitSection() {
  const [stats, setStats] = useState<DirectoryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.stats) {
          setStats(data.stats);
        }
      })
      .catch(() => {
        setStats(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const ecosystemGuarantees = [
    {
      label: 'Interactive Block Types',
      value: '16+',
      detail: 'Hero, Metrics, Stack, Video, FAQ & more',
      icon: Layers,
      gradient: 'from-blue-500/20 to-cyan-500/10',
      iconColor: 'text-cyan-400',
    },
    {
      label: 'Human Review Standard',
      value: '100%',
      detail: 'Curated launches, zero pay-to-rank bias',
      icon: ShieldCheck,
      gradient: 'from-emerald-500/20 to-teal-500/10',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Global Edge Network',
      value: 'Cloudflare KV',
      detail: 'Direct fail-open /go referral routing',
      icon: Globe,
      gradient: 'from-primary/20 to-indigo-500/10',
      iconColor: 'text-primary',
    },
    {
      label: 'Builder Trust Passport',
      value: 'Transparent',
      detail: 'Verifiable score, badges & changelogs',
      icon: Award,
      gradient: 'from-purple-500/20 to-pink-500/10',
      iconColor: 'text-purple-400',
    },
  ];

  const featuredProducts = [
    {
      slug: 'agentkit',
      title: 'AgentKit',
      tagline: 'The Agent-First Operating System & Toolkit for Autonomous Coding Agents',
      trustScore: 98,
      category: 'AI Agents',
      logoUrl: 'https://agentkit.best/agentkit/logo-icon.svg',
    },
    {
      slug: 'goclaw',
      title: 'GoClaw',
      tagline: 'High-Performance Microservices Framework & Cloud Automation Engine',
      trustScore: 94,
      category: 'Cloud Infrastructure',
      logoUrl: 'https://goclaw.sh/logo/goclaw-icon.svg',
    },
    {
      slug: 'agentbrain',
      title: 'AgentBrain',
      tagline: 'Continuous Intelligence & Memory Engine for Autonomous AI Agents',
      trustScore: 96,
      category: 'Knowledge Graphs',
      logoUrl: 'https://agentbrain.sh/icon.svg',
    },
    {
      slug: 'dewee',
      title: 'Dewee',
      tagline: 'Modern Development & Workflow Automation for High-Impact Engineers',
      trustScore: 92,
      category: 'Developer Tools',
      logoUrl: null,
    },
  ];

  return (
    <section className="py-24 px-6 relative overflow-hidden border-t border-border/40 bg-gradient-to-b from-background via-card/10 to-background">
      <div className="container mx-auto max-w-6xl space-y-16">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary gap-1.5 px-3.5 py-1 text-xs rounded-full">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              Verified Builder Ecosystem
            </Badge>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">
              Build with Us
            </h2>
            <p className="text-muted-foreground text-base md:text-lg">
              Showcase your products, get human-verified trust passports, and connect with active builders and early tech adopters across the ecosystem.
            </p>
          </div>

          <Button asChild variant="outline" className="rounded-full gap-2 shrink-0 border-white/20 hover:border-primary/40">
            <Link href="/build-with-us">
              Explore All Products
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        {/* Live Traffic & Community Proof Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card className="p-6 bg-gradient-to-br from-primary/20 via-card/60 to-emerald-500/10 border-white/10 hover:border-primary/30 transition-all rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-lg">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-primary">
                <MousePointerClick className="w-5 h-5" />
              </div>
              <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/10 text-primary flex items-center gap-1">
                <Activity className="w-2.5 h-2.5 animate-pulse" />
                {loading ? 'Connecting' : (stats ? 'Live Traffic' : 'Offline')}
              </Badge>
            </div>
            <div className="mt-6 space-y-1">
              <div className="text-3xl font-extrabold tracking-tight text-foreground">
                {loading ? '...' : (stats ? `${stats.outboundClicks.toLocaleString()}` : '—')}
              </div>
              <div className="text-xs font-semibold text-foreground/90">Outbound Referral Clicks</div>
              <div className="text-[11px] text-muted-foreground pt-0.5">
                {stats ? 'Direct referral routing via /go' : 'Traffic metrics temporarily unavailable'}
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-blue-500/20 via-card/60 to-cyan-500/10 border-white/10 hover:border-cyan-500/30 transition-all rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-lg">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-cyan-400">
                <Box className="w-5 h-5" />
              </div>
              <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 text-muted-foreground">
                Verified
              </Badge>
            </div>
            <div className="mt-6 space-y-1">
              <div className="text-3xl font-extrabold tracking-tight text-foreground">
                {loading ? '...' : (stats ? `${stats.publishedCount}` : '—')}
              </div>
              <div className="text-xs font-semibold text-foreground/90">Published Product Listings</div>
              <div className="text-[11px] text-muted-foreground pt-0.5">
                {stats ? 'Tested & verified directory entries' : 'Directory metrics temporarily unavailable'}
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-purple-500/20 via-card/60 to-pink-500/10 border-white/10 hover:border-purple-500/30 transition-all rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-lg">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-purple-400">
                <Users className="w-5 h-5" />
              </div>
              <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 text-muted-foreground">
                Community
              </Badge>
            </div>
            <div className="mt-6 space-y-1">
              <div className="text-3xl font-extrabold tracking-tight text-foreground">
                {loading ? '...' : (stats ? `${stats.registeredBuilders.toLocaleString()}` : '—')}
              </div>
              <div className="text-xs font-semibold text-foreground/90">Registered Builders & Teams</div>
              <div className="text-[11px] text-muted-foreground pt-0.5">
                {stats ? 'Founders & autonomous developers' : 'Community metrics temporarily unavailable'}
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-emerald-500/20 via-card/60 to-teal-500/10 border-white/10 hover:border-emerald-500/30 transition-all rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-lg">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-emerald-400">
                <ThumbsUp className="w-5 h-5" />
              </div>
              <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 text-muted-foreground">
                Anti-Abuse
              </Badge>
            </div>
            <div className="mt-6 space-y-1">
              <div className="text-3xl font-extrabold tracking-tight text-foreground">
                {loading ? '...' : (stats ? `${stats.totalVotes.toLocaleString()}` : '—')}
              </div>
              <div className="text-xs font-semibold text-foreground/90">Verified Community Votes</div>
              <div className="text-[11px] text-muted-foreground pt-0.5">
                {stats ? 'Protected by Cloudflare Turnstile' : 'Voting metrics temporarily unavailable'}
              </div>
            </div>
          </Card>
        </div>

        {/* Ecosystem Guarantees Proof Cards */}
        <div className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Directory Architectural Standards
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ecosystemGuarantees.map((st) => {
              const Icon = st.icon;
              return (
                <Card
                  key={st.label}
                  className={`p-5 bg-gradient-to-br ${st.gradient} border-white/10 hover:border-primary/30 transition-all rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-md`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-xl bg-white/5 border border-white/10 ${st.iconColor}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <Badge variant="outline" className="text-[9px] border-white/10 bg-white/5 text-muted-foreground">
                      Standard
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-0.5">
                    <div className="text-xl font-bold tracking-tight text-foreground">
                      {st.value}
                    </div>
                    <div className="text-xs font-medium text-foreground/90">
                      {st.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground pt-0.5">
                      {st.detail}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Featured Product Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Zap className="w-4 h-4 text-primary" />
              Featured Verified Products
            </div>
            <Link href="/build-with-us" className="text-xs text-primary hover:underline flex items-center gap-1">
              View full directory ({featuredProducts.length}+ listings)
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {featuredProducts.map((p) => (
              <Card
                key={p.slug}
                className="p-6 bg-white/[0.02] hover:bg-white/[0.04] border-white/10 hover:border-primary/40 transition-all rounded-3xl flex flex-col justify-between group relative overflow-hidden shadow-lg"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <Link
                        href={`/products/${p.slug}`}
                        aria-label={p.title}
                        className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-lg text-primary overflow-hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
                          <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">
                            {p.category}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Verified Launch
                        </span>
                      </div>
                    </div>

                    <Badge variant="outline" className="text-xs font-mono border-white/10 bg-white/5">
                      Trust: <strong className="text-foreground ml-1">{p.trustScore}</strong>/100
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {p.tagline}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 mt-5 border-t border-white/5 text-xs">
                  <Link
                    href={`/products/${p.slug}`}
                    className="text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    View Passport & Blocks
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>

                  <Link
                    href={`/go/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    Visit Website
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Bottom CTA Card */}
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-primary/20 via-card/80 to-cyan-500/20 border border-primary/30 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="space-y-1.5 text-center sm:text-left relative z-10">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Grow Your Distribution
            </div>
            <h3 className="text-2xl font-extrabold text-foreground">Have a product ready to launch?</h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Submit your listing, receive an immutable Trust Passport, and gain organic community distribution across the Next Level Builders ecosystem.
            </p>
          </div>

          <Button asChild size="lg" className="rounded-full shadow-xl gap-2 shrink-0 btn-premium relative z-10 px-8 py-6 text-base font-semibold">
            <Link href="/build-with-us">
              Submit on Build with Us
              <ArrowUpRight className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
