import React from "react";
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { users, products, members, organizations } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import { Card } from "@/components/ui/card";
import ProductLogo from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  ArrowUpRight,
  User,
  Star,
  Globe,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import ShareProfileButton from "@/components/profile/share-profile-button";
import { getTranslations } from "next-intl/server";
import { getPublishedProducts } from "@/lib/domain/catalog";
import { pageMetadata } from "@/lib/seo";

interface BuilderProfileProps {
  params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({ params }: BuilderProfileProps) {
  const { id, locale } = await params;
  const [builder] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  if (!builder) return { title: "Builder not found", robots: { index: false } };
  return pageMetadata({ title: builder.name, description: locale === "en" ? `Published products and builder profile for ${builder.name}.` : `Hồ sơ builder và sản phẩm đã xuất bản của ${builder.name}.`, path: `/builders/${id}`, locale });
}

export default async function BuilderPublicProfilePage({ params }: BuilderProfileProps) {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: "builders" });
  const db = getDb();

  // 1. Fetch user by ID
  const [builder] = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!builder) {
    notFound();
  }

  // 2. Query builder's organizations
  const userMemberships = await db
    .select({
      orgId: members.organizationId,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, builder.id));

  const orgIds = userMemberships.map((m) => m.orgId);

  // 3. Query builder's published products
  let publishedProducts: typeof products.$inferSelect[] = [];
  if (orgIds.length > 0) {
    const batchSize = 100;
    for (let offset = 0; ; offset += batchSize) {
      const batch = await getPublishedProducts({ limit: batchSize, offset, orgIds }, db);
      publishedProducts.push(...batch);
      if (batch.length < batchSize) break;
    }
  }

  const joinYear = new Date(builder.createdAt).getFullYear() || 2026;
  const totalProducts = publishedProducts.length;
  const avgTrustScore =
    totalProducts > 0
      ? Math.round(
          publishedProducts.reduce((acc, p) => acc + (p.trustScore || 0), 0) / totalProducts
        )
      : 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Navbar />

      <div className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-10">
          {/* Builder Public Passport Card */}
          <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/30 to-cyan-500/20 border border-primary/40 flex items-center justify-center font-bold text-3xl text-primary shadow-xl overflow-hidden shrink-0">
                {builder.image ? (
                  <img src={builder.image} alt={builder.name || "Builder"} className="w-full h-full object-cover" />
                ) : (
                  (builder.name || "B").charAt(0).toUpperCase()
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">{builder.name || "Next Level Builder"}</h1>
                  <Badge
                    variant="outline"
                    className="text-xs capitalize border-primary/40 bg-primary/10 text-primary font-mono"
                  >
                    {builder.role === "admin" ? t("platformLead") : t("verifiedBuilder")}
                  </Badge>

                  {builder.emailVerified && (
                    <Badge variant="outline" className="text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      {t("verifiedPassport")}
                    </Badge>
                  )}
                </div>

                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-4 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    {t("builderSince", { year: joinYear })}
                  </span>

                  {userMemberships.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      {userMemberships.map((m) => m.orgName).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ShareProfileButton builderName={builder.name || "Builder"} />
            </div>
          </div>

          {/* Builder Trust Metrics Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-5 bg-white/[0.02] border-white/10 rounded-2xl space-y-1">
              <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t("publishedTools")}</div>
              <div className="text-2xl font-extrabold text-foreground flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <span>{totalProducts}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("publishedToolsDesc")}</p>
            </Card>

            <Card className="p-5 bg-white/[0.02] border-white/10 rounded-2xl space-y-1">
              <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t("avgTrustScore")}</div>
              <div className="text-2xl font-extrabold text-emerald-400 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>{avgTrustScore}/100</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("avgTrustScoreDesc")}</p>
            </Card>

            <Card className="p-5 bg-white/[0.02] border-white/10 rounded-2xl space-y-1">
              <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t("communityStanding")}</div>
              <div className="text-2xl font-extrabold text-cyan-400 flex items-center gap-2">
                <Star className="w-5 h-5 text-cyan-400" />
                <span>{t("communityVerified")}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("communityStandingDesc")}</p>
            </Card>
          </div>

          {/* Published Products Showcase */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                {t("publishedProducts")} ({totalProducts})
              </h3>
            </div>

            {totalProducts === 0 ? (
              <Card className="p-10 bg-white/[0.01] border-white/5 rounded-2xl text-center space-y-3">
                <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto opacity-30" />
                <div className="space-y-1">
                  <div className="font-semibold text-sm text-foreground">{t("noProductsTitle")}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("noProductsDesc")}
                  </p>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {publishedProducts.map((product) => (
                  <Card
                    key={product.id}
                    className="p-5 bg-white/[0.02] border-white/10 hover:border-white/20 transition-all rounded-2xl flex flex-col justify-between space-y-4 group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-lg text-primary overflow-hidden shrink-0">
                          <ProductLogo src={product.logoUrl} name={product.title} />
                        </div>

                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono gap-1"
                        >
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          Trust: {product.trustScore}/100
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <div className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                          {product.title}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {product.tagline}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                      <Link
                        href={`/products/${product.slug}`}
                        className="text-primary hover:underline font-semibold flex items-center gap-1"
                      >
                        {t("viewListing")}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>

                      {product.websiteUrl && (
                        <a
                          href={product.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          <Globe className="w-3 h-3" />
                          {t("website")}
                        </a>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <FooterSection />
    </div>
  );
}
