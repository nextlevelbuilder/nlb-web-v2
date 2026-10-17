// Reads D1 on every request; never prerender at build time.
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { users, products, members, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import ProductLogo from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, CheckCircle2, Calendar, Layers, ArrowUpRight, Globe } from "lucide-react";
import { Link } from "@/i18n/navigation";
import ShareProfileButton from "@/components/profile/share-profile-button";
import { getTranslations } from "next-intl/server";
import { getPublishedProducts } from "@/lib/domain/catalog";
import { pageMetadata } from "@/lib/seo";
import { PassportSection } from "@/components/builder-league/passport/passport-section";

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
  const publishedProducts: typeof products.$inferSelect[] = [];
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-5xl space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <header className="flex flex-col justify-between gap-6 border-b border-line pb-8 md:flex-row md:items-end">
            <div className="flex min-w-0 items-start gap-5">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-surface font-display text-3xl text-primary">
                {builder.image ? (
                  <img src={builder.image} alt="" width={80} height={80} className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden>{(builder.name || "B").charAt(0).toUpperCase()}</span>
                )}
              </div>

              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge>{builder.role === "admin" ? t("platformLead") : t("verifiedBuilder")}</Badge>
                  {builder.emailVerified && (
                    <Badge variant="outline">
                      <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-success" />
                      {t("verifiedPassport")}
                    </Badge>
                  )}
                </div>
                <h1 className="break-words font-display text-step-3xl font-light">{builder.name || "Next Level Builder"}</h1>
                <p className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-step-xs text-ink-3">
                  <span className="flex items-center gap-1.5">
                    <Calendar aria-hidden className="h-3.5 w-3.5 text-primary" />
                    {t("builderSince", { year: joinYear })}
                  </span>
                  {userMemberships.length > 0 && (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Layers aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="break-words">{userMemberships.map((m) => m.orgName).join(", ")}</span>
                    </span>
                  )}
                </p>
              </div>
            </div>

            <ShareProfileButton />
          </header>

          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
            <div className="space-y-1 bg-surface p-5">
              <dt className="mono-label text-ink-3">{t("publishedTools")}</dt>
              <dd className="num-tab font-display text-step-2xl">{totalProducts}</dd>
              <dd className="text-step-sm text-ink-2">{t("publishedToolsDesc")}</dd>
            </div>
            <div className="space-y-1 bg-surface p-5">
              <dt className="mono-label text-ink-3">{t("avgTrustScore")}</dt>
              <dd className="num-tab font-display text-step-2xl">
                {totalProducts > 0 ? (
                  <>
                    {avgTrustScore}
                    <span className="text-step-sm text-ink-3"> / 100</span>
                  </>
                ) : (
                  <span aria-label="—">—</span>
                )}
              </dd>
              <dd className="text-step-sm text-ink-2">{t("avgTrustScoreDesc")}</dd>
            </div>
          </dl>

          <section aria-labelledby="published-products" className="space-y-5">
            <h2 id="published-products" className="flex items-center gap-2 font-display text-step-xl font-normal">
              {t("publishedProducts")} <span className="num-tab text-ink-3">({totalProducts})</span>
            </h2>

            {totalProducts === 0 ? (
              <div className="surface-panel space-y-2 p-10 text-center">
                <ShieldCheck aria-hidden className="mx-auto h-10 w-10 text-ink-3" strokeWidth={1.25} />
                <p className="font-medium">{t("noProductsTitle")}</p>
                <p className="text-step-sm text-ink-2">{t("noProductsDesc")}</p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {publishedProducts.map((product) => (
                  <li key={product.id} className="surface-panel group flex flex-col justify-between gap-4 p-5 transition-colors duration-base hover:border-line-strong">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-background font-display text-lg text-primary">
                          <ProductLogo src={product.logoUrl} name={product.title} />
                        </div>
                        <Badge variant="outline">
                          <ShieldCheck aria-hidden className="h-3 w-3 text-primary" />
                          {product.trustScore}/100
                        </Badge>
                      </div>
                      <h3 className="text-step-base font-medium">{product.title}</h3>
                      <p className="line-clamp-2 text-step-sm text-ink-2">{product.tagline}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-step-sm">
                      <Link href={`/products/${product.slug}`} className="inline-flex min-h-[44px] items-center gap-1 font-medium text-primary hover:underline hover:underline-offset-4">
                        {t("viewListing")}
                        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                      </Link>
                      {product.websiteUrl && (
                        <a
                          href={product.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[44px] items-center gap-1 text-ink-2 hover:text-foreground"
                        >
                          <Globe aria-hidden className="h-3.5 w-3.5" />
                          {t("website")}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <PassportSection userId={builder.id} locale={locale} />
        </div>
      </main>
    </div>
  );
}
