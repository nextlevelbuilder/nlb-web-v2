import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { toPageLocale } from "@/content/pages/page-locale";
import { bankTransferPageCopy } from "@/content/pages/bank-transfer-page-copy";
import { BankTransferClient } from "@/components/checkout/bank-transfer-client";
import { isSepayEnabled } from "@/lib/payments/sepay-catalog";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sku?: string; course?: string; order?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: bankTransferPageCopy[toPageLocale(locale)].metaTitle, robots: { index: false, follow: false } };
}

/** VietQR checkout through SePay: creates (or resumes) an order and waits for the matching transfer. */
export default async function BankTransferPage({ params, searchParams }: Props) {
  if (!isSepayEnabled()) notFound();
  const { locale } = await params;
  const { sku, course, order } = await searchParams;
  return (
    <main id="main" className="sky-backdrop flex min-h-screen items-center justify-center bg-background px-4 py-16 text-foreground">
      <BankTransferClient
        locale={toPageLocale(locale)}
        sku={sku ?? null}
        courseVideoSlug={course ?? null}
        orderCode={order ?? null}
      />
    </main>
  );
}
