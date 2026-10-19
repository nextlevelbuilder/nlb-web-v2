export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

import { notFound } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { products, productRevisions, members } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import ProductLogo from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Eye, ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import type { ProductDocument } from "@nextlevelbuilder/contracts";
import PreviewPublishButton from "@/components/studio/preview-publish-button";
import { getTranslations } from "next-intl/server";

interface StudioPreviewProps {
  params: Promise<{ slug: string; locale: string }>;
}

export default async function StudioProductPreviewPage({ params }: StudioPreviewProps) {
  const { slug, locale } = await params;
  const t = await getTranslations({ locale, namespace: "preview" });
  const db = getDb();
  let session = null;

  try {
    const auth = getAuth();
    const reqHeaders = await headers();
    session = await auth.api.getSession({ headers: reqHeaders });
  } catch (err) {
    console.warn("Studio preview session error (non-fatal):", err);
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);

  if (!product) {
    notFound();
  }

  // Preview always reads the latest draft, including unpublished edits to live products.
  {
    if (!session || !session.user) {
      notFound();
    }

    if ((session.user as { role?: string }).role !== "admin") {
      const [membership] = await db
        .select()
        .from(members)
        .where(and(eq(members.organizationId, product.orgId), eq(members.userId, session.user.id)))
        .limit(1);

      if (!membership) {
        notFound();
      }
    }
  }

  // Fetch the latest candidate revision for studio preview
  const [latestRevision] = await db
    .select()
    .from(productRevisions)
    .where(eq(productRevisions.productId, product.id))
    .orderBy(desc(productRevisions.revisionNumber), desc(productRevisions.createdAt))
    .limit(1);

  if (!latestRevision) {
    notFound();
  }

  const rawDoc = latestRevision.document;
  const document = (typeof rawDoc === "string" ? JSON.parse(rawDoc) : rawDoc || {}) as ProductDocument;
  const blocks = Array.isArray(document?.blocks) ? document.blocks : [];
  // Older rows exposed the raw snake_case column; keep reading it as a fallback.
  const contentHash = latestRevision.contentHash || (latestRevision as { content_hash?: string }).content_hash || "";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="flex-1">
        <div className="wrap max-w-5xl space-y-8 pb-section-sm pt-[calc(var(--header-h)+2rem)] md:pt-[calc(var(--header-h)+3rem)]">
          <nav aria-label={t("backToStudio")} className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link href="/studio">
                <ArrowLeft aria-hidden className="h-4 w-4" />
                {t("backToStudio")}
              </Link>
            </Button>
            {product.status === "published" && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href={`/products/${product.slug}`}>
                  {t("viewLivePage")}
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </nav>

          <section
            aria-label={t("sandboxPreview")}
            className="flex flex-col items-start justify-between gap-4 rounded-sm border border-warning/50 bg-warning/10 p-4 sm:flex-row sm:items-center sm:p-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Eye aria-hidden className="h-5 w-5 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="text-step-sm font-medium text-foreground">{t("sandboxPreview")}</p>
                <p className="break-words font-mono text-step-xs text-ink-2">
                  {t("revision")} #{latestRevision.revisionNumber} ({t("hash")}: {contentHash ? contentHash.slice(0, 12) : "draft"}…) · {t("status")}:{" "}
                  <span className="uppercase text-foreground">{product.status}</span>
                </p>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
              <Badge variant="outline" className="border-warning/50 text-warning">{t("draftMode")}</Badge>
              <PreviewPublishButton slug={product.slug} status={product.status} />
            </div>
          </section>

          <article className="space-y-12 pt-4">
            <header className="flex items-center gap-5 border-b border-line pb-8">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-surface-raised text-primary">
                <ProductLogo src={product.logoUrl} name={product.title} />
              </div>
              <div className="min-w-0">
                <h1 className="break-words font-display text-step-2xl font-light">{product.title}</h1>
                <p className="mt-1 text-step-md text-ink-2">{product.tagline}</p>
              </div>
            </header>
            <BlockRenderer blocks={blocks} />
          </article>
        </div>
      </main>
    </div>
  );
}
