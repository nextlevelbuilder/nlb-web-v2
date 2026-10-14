"use client";

import { useState } from "react";
import Link from "next/link";
import { Crown, Lock, ShoppingCart } from "lucide-react";
import { formatCoursePrice, getCoursesCopy, toCoursesLocale } from "@/lib/courses/courses-copy";
import { localizedPath } from "@/lib/seo";

interface CourseLockedPanelProps {
  slug: string;
  priceCents: number;
  currency: string;
  locale: string;
  signedIn: boolean;
  paymentReturned: boolean;
}

/** Locked state: explains the two ways in (buy this video, or VIP) and starts a Polar checkout. */
export function CourseLockedPanel({ slug, priceCents, currency, locale, signedIn, paymentReturned }: CourseLockedPanelProps) {
  const copy = getCoursesCopy(locale);
  const price = formatCoursePrice(priceCents, currency, locale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoPath = localizedPath(`/courses/${slug}`, locale);
  const signInHref = `${localizedPath("/sign-in", locale)}?callbackUrl=${encodeURIComponent(videoPath)}`;

  async function startCheckout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/videos/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: toCoursesLocale(locale) }),
      });
      if (res.status === 401) {
        window.location.assign(signInHref);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { url?: unknown };
      if (!res.ok || typeof body.url !== "string") throw new Error(`Checkout failed with status ${res.status}`);
      window.location.assign(body.url);
    } catch (checkoutError) {
      console.error("Course checkout failed:", checkoutError);
      setError(copy.checkoutError);
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="course-locked-title" className="p-3 text-ink sm:p-5">
      <p className="mono flex items-center gap-2 text-ink-3">
        <Lock aria-hidden className="h-3.5 w-3.5 text-primary" />
        <span>{price}</span>
      </p>
      <h2 id="course-locked-title" className="mt-3 font-display text-step-xl">{copy.lockedTitle}</h2>
      {paymentReturned && (
        <p role="status" className="mt-4 rounded-sm border border-line bg-surface-raised p-3 text-step-sm">{copy.paymentPending}</p>
      )}
      <p className="mt-3 text-step-sm text-ink-2">{copy.lockedBody}</p>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        <li className="flex flex-col gap-4 rounded-sm border border-line p-5">
          <ShoppingCart aria-hidden className="h-5 w-5 text-primary" />
          <p className="text-step-sm text-ink-2">{copy.buyOption(price)}</p>
          {signedIn ? (
            <button type="button" className="btn btn-primary btn-sm mt-auto self-start" onClick={() => void startCheckout()} disabled={pending} aria-busy={pending}>
              {copy.buyButton(price)}
            </button>
          ) : (
            <Link className="btn btn-primary btn-sm mt-auto self-start" href={signInHref}>{copy.signInToBuy}</Link>
          )}
        </li>
        <li className="flex flex-col gap-4 rounded-sm border border-dashed border-line-strong p-5">
          <Crown aria-hidden className="h-5 w-5 text-primary" />
          <p className="text-step-sm text-ink-2">{copy.vipOption}</p>
          <Link className="btn btn-ghost btn-sm mt-auto self-start" href={`${localizedPath("/", locale)}#pricing`}>{copy.vipButton}</Link>
        </li>
      </ul>
      {error && <p role="alert" className="mt-4 text-step-sm text-destructive">{error}</p>}
    </section>
  );
}
