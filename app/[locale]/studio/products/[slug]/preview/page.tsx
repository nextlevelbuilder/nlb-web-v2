import React from "react";
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
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProductDocument } from "@/packages/contracts/src";
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

    if ((session.user as any).role !== "admin") {
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
  const contentHash = latestRevision.contentHash || (latestRevision as any)?.content_hash || "";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Navbar />

      <div className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Back to Studio navigation */}
          <div className="flex items-center justify-between">
            <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <Link href="/studio">
                <ArrowLeft className="w-4 h-4" />
                {t('backToStudio')}
              </Link>
            </Button>

            {product.status === "published" && (
              <Button asChild variant="outline" size="sm" className="gap-2 border-emerald-500/30 text-emerald-400">
                <Link href={`/products/${product.slug}`}>
                  {t('viewLivePage')}
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            )}
          </div>

          {/* Studio Preview Watermark Bar with Publish Action */}
          <div className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-sm font-bold text-amber-400">{t('sandboxPreview')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('revision')} #{latestRevision.revisionNumber} ({t('hash')}: {contentHash ? contentHash.slice(0, 12) : "draft"}…) • {t('status')}:{" "}
                  <span className="font-semibold text-foreground uppercase">{product.status}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs px-3 py-1 bg-amber-500/5">
                {t('draftMode')}
              </Badge>
              <PreviewPublishButton slug={product.slug} status={product.status} />
            </div>
          </div>

          {/* Main Listing Block Presentation */}
          <main className="space-y-12 pt-4">
            <div className="border-b border-white/10 pb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-2xl text-primary overflow-hidden shrink-0">
                  <ProductLogo src={product.logoUrl} name={product.title} />
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold tracking-tight">{product.title}</h1>
                  <p className="text-lg text-muted-foreground mt-1">{product.tagline}</p>
                </div>
              </div>
            </div>

            <BlockRenderer blocks={blocks} />
          </main>
        </div>
      </div>

      <FooterSection />
    </div>
  );
}
