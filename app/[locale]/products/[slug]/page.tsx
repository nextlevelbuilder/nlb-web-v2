import { notFound } from "next/navigation";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";
import { getProductTrustFactors, evaluateProductBadges } from "@/lib/domain/trust";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import ProductLogo from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, CheckCircle2, ShieldCheck, Award, TrendingUp, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { directoryCopy } from "@/content/pages/directory-copy";
import { toPageLocale } from "@/content/pages/page-locale";
import type { ProductDocument } from "@/packages/contracts/src";
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import { getTranslations } from "next-intl/server";
import { pageMetadata, serializeJsonLd, localizedPath, siteUrl } from "@/lib/seo";

// Reads D1 on every request; never prerender at build time.
export const dynamic = "force-dynamic";

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
  // Older rows exposed the raw snake_case column; keep reading it as a fallback.
  const contentHash = revision?.contentHash || (revision as { content_hash?: string } | undefined)?.content_hash || "";
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-5xl space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <header className="flex flex-col justify-between gap-6 border-b border-line pb-8 md:flex-row md:items-end">
            <div className="flex min-w-0 items-start gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-surface font-display text-2xl text-primary">
                <ProductLogo src={product.logoUrl} name={product.title} imgWidth={64} imgHeight={64} />
              </div>
              <div className="min-w-0 space-y-2">
                <Badge>
                  <CheckCircle2 aria-hidden className="h-3 w-3" />
                  {t('verifiedLaunch')}
                </Badge>
                <h1 className="break-words font-display text-step-3xl font-light">{product.title}</h1>
                <p className="lede max-w-[52ch]">{product.tagline}</p>
              </div>
            </div>

            <Button asChild size="lg" className="self-start md:self-auto">
              <Link href={`/go/${product.slug}`} target="_blank" rel="noopener noreferrer">
                {t('visitWebsite')}
                <ArrowUpRight aria-hidden />
                <span className="sr-only">{directoryCopy[toPageLocale(locale)].opensInNewTab}</span>
              </Link>
            </Button>
          </header>

          <section aria-labelledby="trust-passport" className="surface-panel flex flex-col justify-between gap-6 p-6 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <ShieldCheck aria-hidden className="h-8 w-8 shrink-0 text-primary" strokeWidth={1.25} />
              <div>
                <h2 id="trust-passport" className="mono-label text-ink-3">
                  {t('trustPassportScore')}
                </h2>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="num-tab font-display text-step-2xl">{trustScore}</span>
                  <span className="text-step-sm text-ink-3">/ 100</span>
                </p>
              </div>
            </div>

            {grantedBadges.length > 0 && (
              <ul className="flex flex-wrap items-center gap-2">
                {grantedBadges.map((badge) => (
                  <li key={badge.id}>
                    <Badge variant="outline" title={badge.description}>
                      {badge.id === "human_approved" ? (
                        <Award aria-hidden className="h-3.5 w-3.5 text-primary" />
                      ) : badge.id === "community_voted" ? (
                        <ThumbsUp aria-hidden className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <TrendingUp aria-hidden className="h-3.5 w-3.5 text-primary" />
                      )}
                      {badge.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-12">
            <BlockRenderer blocks={blocks} productSlug={product.slug} />
          </div>

          <footer className="flex flex-col items-start justify-between gap-4 border-t border-line pt-8 text-step-sm text-ink-3 sm:flex-row sm:items-center">
            <p className="flex items-center gap-2">
              <ShieldCheck aria-hidden className="h-4 w-4 text-primary" />
              {t('humanReviewedBy')}
            </p>
            <p className="break-all">
              {t('contentHash')} <span className="font-mono">{contentHash ? contentHash.slice(0, 16) : "verified"}…</span>
            </p>
          </footer>
        </div>
      </main>
      <FooterSection />
    </div>
  );
}
