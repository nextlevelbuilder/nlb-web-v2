import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight, Award, ShieldCheck, ThumbsUp, TrendingUp } from "lucide-react";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";
import { publishedDocument } from "@/lib/domain/published-document";
import { getProductTrustFactors, evaluateProductBadges } from "@/lib/domain/trust";
import { BlockRenderer, type BlockLabels } from "@/components/blocks/block-renderer";
import { bareXHandle } from "@/components/blocks/founder-block";
import ChapterPlate from "@/components/constellation/chapter-plate";
import ProductLogo from "@/components/product-logo";
import { directoryCopy } from "@/content/pages/directory-copy";
import { toPageLocale } from "@/content/pages/page-locale";
import type { Block } from "@nextlevelbuilder/contracts";
import { pageMetadata, serializeJsonLd, localizedPath } from "@/lib/seo";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/structured-data";
import "./product-page.css";

// Reads D1 on every request; never prerender at build time.
export const dynamic = "force-dynamic";

const PLATE_COORD = "Polaris · RA 02h 31m · Dec +89° 15′";

interface ProductPageProps {
  params: Promise<{ slug: string; locale: string }>;
}

type FounderBlock = Extract<Block, { type: "founder" }>;
type PricingBlock = Extract<Block, { type: "pricing" }>;

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug, locale } = await params;
  const result = await getPublishedProductBySlug(slug);
  if (!result) return { title: "Product not found", robots: { index: false } };
  return pageMetadata({ title: result.product.title, description: result.product.tagline, path: `/products/${slug}`, locale });
}

export default async function PublicProductPage({ params }: ProductPageProps) {
  const { slug, locale } = await params;
  const t = await getTranslations({ locale, namespace: "productDetail" });
  const tNav = await getTranslations({ locale, namespace: "buildWithUs" });
  const result = await getPublishedProductBySlug(slug);

  if (!result) {
    notFound();
  }

  const { product, revision } = result;
  const document = publishedDocument(revision);
  const blocks: Block[] = Array.isArray(document?.blocks) ? document.blocks : [];
  // Older rows exposed the raw snake_case column; keep reading it as a fallback.
  const contentHash = revision?.contentHash || (revision as { content_hash?: string } | undefined)?.content_hash || "";
  const trustScore = product.trustScore;
  const grantedBadges = evaluateProductBadges(getProductTrustFactors(product)).filter((b) => b.isGranted);
  const founders = blocks.filter((block): block is FounderBlock => block.type === "founder");
  const pricingTiers = blocks
    .filter((block): block is PricingBlock => block.type === "pricing")
    .flatMap((block) => block.props.tiers.map((tier) => ({ name: tier.name, price: tier.price })));
  const opensInNewTab = directoryCopy[toPageLocale(locale)].opensInNewTab;
  const directoryPath = localizedPath("/build-with-us", locale);
  const blockLabels: BlockLabels = {
    gallery: t("blocks.gallery"),
    features: t("blocks.features"),
    techStack: t("blocks.techStack"),
    pricing: t("blocks.pricing"),
    faq: t("blocks.faq"),
    founder: t("blocks.founder"),
    popular: t("blocks.popular"),
    opensInNewTab: t("blocks.opensInNewTab"),
    linkedin: t("blocks.linkedin"),
    // `{n}` is filled per image by the gallery block; raw keeps next-intl from parsing it as an ICU argument.
    openImage: t.raw("blocks.openImage") as string,
    imageAlt: t.raw("blocks.imageAlt") as string,
  };

  const jsonLd = [
    productJsonLd({
      title: product.title,
      tagline: product.tagline,
      description: document.description,
      websiteUrl: product.websiteUrl,
      logoUrl: product.logoUrl,
      slug: product.slug,
      locale,
      categories: document.categorySlugs,
      tags: document.tagSlugs,
      pricingTiers,
      makers: founders.map((founder) => ({ name: founder.props.name, xHandle: founder.props.xHandle ?? null })),
    }),
    breadcrumbJsonLd([
      { name: t("breadcrumbHome"), path: "/" },
      { name: t("breadcrumbDirectory"), path: "/build-with-us" },
      { name: product.title, path: `/products/${product.slug}` },
    ], locale),
  ];

  return (
    <main id="main" className="product-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="wrap">
        <div className="page-head pp-head">
          <nav aria-label={t("breadcrumbLabel")} className="pp-crumbs mono">
            <ol>
              <li><Link href={localizedPath("/", locale)}>{t("breadcrumbHome")}</Link></li>
              <li><Link href={directoryPath}>{t("breadcrumbDirectory")}</Link></li>
              <li><span aria-current="page">{product.title}</span></li>
            </ol>
          </nav>
          <ChapterPlate numeral="IV" name={t("plateName")} coord={PLATE_COORD} />

          <div className="pp-mast">
            <div className="pp-id">
              <div className="pp-logo">
                <ProductLogo src={product.logoUrl} name={product.title} imgWidth={80} imgHeight={80} imgClassName="pp-logo-img" />
              </div>
              <div className="pp-id-text">
                <p className="badge pp-verified">
                  <ShieldCheck aria-hidden className="pp-icon" />
                  {t("verifiedLaunch")}
                </p>
                <h1 className="h1-page pp-title">{product.title}</h1>
                <p className="lede pp-tagline">{product.tagline}</p>
                <div className="pp-actions">
                  <a className="btn btn-primary" href={`/go/${product.slug}`} target="_blank" rel="noopener noreferrer">
                    {t("visitWebsite")}
                    <ArrowUpRight aria-hidden className="arrow" />
                    <span className="sr-only">{opensInNewTab}</span>
                  </a>
                  <Link className="link-arrow pp-back" href={directoryPath}>
                    <span aria-hidden="true">←</span> {t("backToDirectory")}
                  </Link>
                </div>
              </div>
            </div>

            <aside className="pp-facts surface" aria-labelledby="pp-trust-title">
              <div className="pp-trust">
                <TrustRing score={trustScore} />
                <div>
                  <h2 id="pp-trust-title" className="mono pp-facts-label">{t("trustPassportScore")}</h2>
                  <p className="pp-trust-value">
                    <span className="num-tab">{trustScore}</span>
                    <span className="mono">{t("trustOutOf")}</span>
                  </p>
                </div>
              </div>

              {grantedBadges.length > 0 && (
                <div className="pp-facts-row">
                  <h3 className="mono pp-facts-label">{t("badgesLabel")}</h3>
                  <ul className="pp-badges">
                    {grantedBadges.map((badge) => (
                      <li key={badge.id} title={badge.description}>
                        {badge.id === "human_approved" ? (
                          <Award aria-hidden className="pp-icon" />
                        ) : badge.id === "community_voted" ? (
                          <ThumbsUp aria-hidden className="pp-icon" />
                        ) : (
                          <TrendingUp aria-hidden className="pp-icon" />
                        )}
                        {badge.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {founders.length > 0 && (
                <div className="pp-facts-row">
                  <h3 className="mono pp-facts-label">{t("makerLabel")}</h3>
                  <ul className="pp-makers">
                    {founders.map((founder) => {
                      const handle = bareXHandle(founder.props.xHandle);
                      return (
                        <li key={founder.id} className="pp-maker">
                          <span className="pp-maker-avatar" aria-hidden="true">
                            {founder.props.avatarUrl ? (
                              <img src={founder.props.avatarUrl} alt="" width={40} height={40} loading="lazy" decoding="async" />
                            ) : (
                              founder.props.name.trim().charAt(0).toUpperCase()
                            )}
                          </span>
                          <span className="pp-maker-text">
                            <strong>{founder.props.name}</strong>
                            {handle && (
                              <a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer">
                                @{handle}
                                <span className="sr-only">{opensInNewTab}</span>
                              </a>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        </div>

        {blocks.length > 0 && (
          <article className="pp-blocks" aria-label={`${t("listingLabel")} · ${product.title}`}>
            <BlockRenderer blocks={blocks} productSlug={product.slug} labels={blockLabels} />
          </article>
        )}

        <footer className="pp-foot mono">
          <p className="pp-foot-review">
            <span className="pp-foot-star" aria-hidden="true">✦</span>
            {t("humanReviewedBy")}
          </p>
          <p className="pp-foot-hash">
            {t("contentHash")} <span className="num-tab">{contentHash ? `${contentHash.slice(0, 16)}…` : "verified"}</span>
          </p>
          <Link className="link-arrow" href={directoryPath}>
            {tNav("plateName")} <span aria-hidden="true">→</span>
          </Link>
        </footer>
      </div>
    </main>
  );
}

/** Trust score drawn as an orbit that fills clockwise; the number beside it carries the meaning. */
function TrustRing({ score }: { score: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <svg className="pp-ring" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle className="pp-ring-track" cx="32" cy="32" r={radius} />
      <circle
        className="pp-ring-fill"
        cx="32"
        cy="32"
        r={radius}
        strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        transform="rotate(-90 32 32)"
      />
      <circle className="pp-ring-core" cx="32" cy="32" r="3" />
    </svg>
  );
}
