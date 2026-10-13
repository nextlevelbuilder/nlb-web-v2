import React from "react";
import { notFound } from "next/navigation";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";
import { getProductTrustFactors, evaluateProductBadges } from "@/lib/domain/trust";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import ProductLogo from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, CheckCircle2, ShieldCheck, Award, TrendingUp, ThumbsUp } from "lucide-react";
import Link from "next/link";
import type { ProductDocument } from "@/packages/contracts/src";
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import { getTranslations } from "next-intl/server";
import { pageMetadata, serializeJsonLd, localizedPath, siteUrl } from "@/lib/seo";

interface ProductPageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug, locale } = await params;
  const result = await getPublishedProductBySlug(slug);
  if (!result) return { title: "Product not found", robots: { index: false } };
  return pageMetadata({ title: result.product.title, description: result.product.tagline, path: `/products/${slug}`, locale });
}

export default async function PublicProductPage({ params }: ProductPageProps) {
  const { slug, locale } = await params;
  const t = await getTranslations({ locale, namespace: "productDetail" });
  const result = await getPublishedProductBySlug(slug);

  if (!result) {
    notFound();
  }

  const { product, revision } = result;
  const rawDoc = revision?.document;
  const document = (typeof rawDoc === "string" ? JSON.parse(rawDoc) : rawDoc || {}) as ProductDocument;
  const blocks = Array.isArray(document?.blocks) ? document.blocks : [];
  const contentHash = revision?.contentHash || (revision as any)?.content_hash || "";
  // Compute Trust Passport and Badges
  const trustFactors = getProductTrustFactors(product);
  const trustScore = product.trustScore;
  const grantedBadges = evaluateProductBadges(trustFactors).filter((b) => b.isGranted);

  // JSON-LD Structured Data for SEO / GEO
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: product.title,
    description: product.tagline,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: product.websiteUrl,
    mainEntityOfPage: `${siteUrl()}${localizedPath(`/products/${slug}`, locale)}`,
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Navbar />
      <div className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-12">
      {/* Inject JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <div className="max-w-5xl mx-auto space-y-12">
        {/* Product Hero Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-white/10">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-2xl text-primary overflow-hidden shrink-0">
              <ProductLogo src={product.logoUrl} name={product.title} imgWidth={64} imgHeight={64} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-extrabold tracking-tight">{product.title}</h1>
                <Badge variant="outline" className="text-xs border-primary/40 bg-primary/10 text-primary gap-1">
                  <CheckCircle2 className="w-3 h-3 text-primary" />
                  {t('verifiedLaunch')}
                </Badge>
              </div>
              <p className="text-lg text-muted-foreground mt-1">{product.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild size="lg" className="rounded-full shadow-lg gap-2">
              <Link href={`/go/${product.slug}`} target="_blank" rel="noopener noreferrer">
                {t('visitWebsite')}
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </header>

        {/* Trust Passport Snapshot Card */}
        <section className="p-6 rounded-2xl border border-primary/20 bg-primary/[0.02] flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="text-xs uppercase font-mono tracking-wider text-muted-foreground font-semibold">
                {t('trustPassportScore')}
              </div>
              <div className="text-2xl font-extrabold text-foreground flex items-baseline gap-1.5 mt-0.5">
                <span>{trustScore}</span>
                <span className="text-sm font-normal text-muted-foreground">/ 100</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {grantedBadges.map((badge) => (
              <Badge key={badge.id} variant="outline" className="px-3 py-1 text-xs gap-1.5 border-white/10 bg-white/[0.03]">
                {badge.id === "human_approved" ? (
                  <Award className="w-3.5 h-3.5 text-primary" />
                ) : badge.id === "community_voted" ? (
                  <ThumbsUp className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                )}
                {badge.name}
              </Badge>
            ))}
          </div>
        </section>

        {/* Dynamic Block Document Presentation */}
        <main className="space-y-12">
          <BlockRenderer blocks={blocks} productSlug={product.slug} />
        </main>

        {/* Verification & Trust Footer */}
        <footer className="mt-16 pt-8 border-t border-white/10 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>{t('humanReviewedBy')}</span>
          </div>
          <div>
            {t('contentHash')} <span className="font-mono">{contentHash ? contentHash.slice(0, 16) : "verified"}…</span>
          </div>
        </footer>
      </div>
        </div>
      </div>
      <FooterSection />
    </div>
  );
}
