"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Landmark, Loader2 } from "lucide-react";
import { bankTransferPageCopy } from "@/content/pages/bank-transfer-page-copy";
import type { PageLocale } from "@/content/pages/page-locale";
import type { SepayOrderView } from "@/lib/payments/sepay-catalog";
import { localizedPath } from "@/lib/seo";

type LoadState = { kind: "loading" } | { kind: "signin" } | { kind: "unavailable" } | { kind: "error" } | { kind: "order"; order: SepayOrderView };

const POLL_MS = 5000;

interface BankTransferClientProps {
  locale: PageLocale;
  sku: string | null;
  courseVideoSlug: string | null;
  orderCode: string | null;
}

/**
 * Creates the transfer order once (the code is then kept in `?order=` so a reload resumes it), shows
 * the VietQR and bank details, and polls the order until the SePay webhook marks it paid.
 */
export function BankTransferClient({ locale, sku, courseVideoSlug, orderCode }: BankTransferClientProps) {
  const copy = bankTransferPageCopy[locale];
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const res = orderCode
          ? await fetch(`/api/checkout/sepay/${encodeURIComponent(orderCode)}`, { credentials: "same-origin" })
          : await fetch("/api/checkout/sepay", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...(sku ? { sku } : { courseVideoSlug }), locale }),
            });
        if (res.status === 401) return setState({ kind: "signin" });
        if (res.status === 404 || res.status === 400) return setState({ kind: "unavailable" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const order = (await res.json()) as SepayOrderView;
        if (!orderCode) {
          const url = new URL(window.location.href);
          url.searchParams.set("order", order.orderCode);
          window.history.replaceState(null, "", url);
        }
        setState({ kind: "order", order });
      } catch {
        setState({ kind: "error" });
      }
    })();
  }, [orderCode, sku, courseVideoSlug, locale]);

  const pendingCode = state.kind === "order" && state.order.status !== "paid" ? state.order.orderCode : null;
  useEffect(() => {
    if (!pendingCode) return;
    const timer = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/checkout/sepay/${encodeURIComponent(pendingCode)}`, { credentials: "same-origin" });
        if (res.ok) setState({ kind: "order", order: (await res.json()) as SepayOrderView });
      } catch {
        // Keep polling; a transient network error is not a payment state.
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pendingCode]);

  return (
    <div className="surface-panel w-full max-w-2xl space-y-6 p-6 shadow-constellation sm:p-10">
      <header className="space-y-3 text-center">
        <Landmark aria-hidden className="mx-auto h-10 w-10 text-primary" strokeWidth={1.25} />
        <p className="eyebrow justify-center">{copy.eyebrow}</p>
        <h1 className="font-display text-step-2xl font-light">{copy.title}</h1>
        <p className="lede mx-auto">{copy.lede}</p>
      </header>
      <Body state={state} locale={locale} />
    </div>
  );
}

function Body({ state, locale }: { state: LoadState; locale: PageLocale }) {
  const copy = bankTransferPageCopy[locale];
  if (state.kind === "loading") {
    return (
      <p role="status" className="flex items-center justify-center gap-2 text-step-sm text-ink-2">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        {copy.creating}
      </p>
    );
  }
  if (state.kind === "signin") {
    const here = typeof window === "undefined" ? localizedPath("/", locale) : window.location.pathname + window.location.search;
    return (
      <div className="space-y-4 text-center">
        <p className="text-step-sm text-ink-2">{copy.signInPrompt}</p>
        <Link className="btn btn-primary" href={`${localizedPath("/sign-in", locale)}?callbackUrl=${encodeURIComponent(here)}`}>
          {copy.signIn}
        </Link>
      </div>
    );
  }
  if (state.kind === "unavailable" || state.kind === "error") {
    return (
      <div className="space-y-4 text-center">
        <p role="alert" className="text-step-sm text-ink-2">{state.kind === "error" ? copy.createError : copy.unavailable}</p>
        <Link className="btn btn-ghost" href={localizedPath("/", locale)}>{copy.backHome}</Link>
      </div>
    );
  }

  const { order } = state;
  if (order.status === "paid") {
    const until = order.validUntil
      ? new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "long" }).format(new Date(order.validUntil))
      : null;
    const next =
      order.productKind === "membership"
        ? { href: localizedPath("/onboarding", locale), label: copy.continueOnboarding }
        : { href: localizedPath("/account", locale), label: copy.backHome };
    return (
      <div role="status" className="space-y-4 text-center">
        <CheckCircle2 aria-hidden className="mx-auto h-12 w-12 text-primary" strokeWidth={1.25} />
        <p className="text-step-base">{until ? copy.paidMembership(until) : copy.paid}</p>
        <Link className="btn btn-primary" href={next.href}>{next.label}</Link>
      </div>
    );
  }

  const amount = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(order.amountVnd);
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_1fr] md:items-start">
      {/* eslint-disable-next-line @next/next/no-img-element -- remote VietQR image rendered by SePay */}
      <img src={order.qrUrl} alt={copy.qrAlt} width={240} height={240} className="mx-auto w-full max-w-60 rounded-sm border border-line bg-white p-2" />
      <div className="space-y-3 text-step-sm">
        <p className="font-display text-step-lg">{order.productName}</p>
        <dl className="space-y-3">
        <Row label={copy.bank} value={order.bankCode ?? "—"} />
        <Row label={copy.account} value={order.bankAccount ?? "—"} copyValue={order.bankAccount} copy={copy} />
        <Row label={copy.amount} value={amount} copyValue={String(order.amountVnd)} copy={copy} />
        <Row label={copy.content} value={order.transferContent} copyValue={order.transferContent} copy={copy} strong />
        </dl>
        <p className="text-ink-3">{copy.contentHint}</p>
        <p role="status" className="flex items-start gap-2 rounded-sm border border-line bg-surface p-3 text-ink-2">
          {order.status === "amount_mismatch" ? (
            copy.mismatch
          ) : (
            <>
              <Loader2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
              {copy.waiting}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  copyValue,
  copy,
  strong,
}: {
  label: string;
  value: string;
  copyValue?: string | null;
  copy?: { copy: string; copied: string };
  strong?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
      <dt className="mono-label text-ink-3">{label}</dt>
      <dd className={`flex min-w-0 items-center gap-2 break-all ${strong ? "font-mono text-step-base text-primary" : "num-tab"}`}>
        {value}
        {copyValue && copy && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={`${copy.copy} ${label}`}
            onClick={() => {
              void navigator.clipboard?.writeText(copyValue).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            <Copy aria-hidden className="h-3.5 w-3.5" />
            <span aria-live="polite">{copied ? copy.copied : copy.copy}</span>
          </button>
        )}
      </dd>
    </div>
  );
}
