"use client";

import { useState } from "react";
import Link from "next/link";
import { Crown, Lock, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <section aria-labelledby="course-locked-title" className="surface-panel p-6 text-ink sm:p-8">
      <div className="flex items-center gap-2">
        <Lock aria-hidden className="h-5 w-5 text-primary" />
        <h2 id="course-locked-title" className="font-display text-step-xl">{copy.lockedTitle}</h2>
      </div>
      {paymentReturned && (
        <p role="status" className="mt-4 rounded-sm border border-line bg-surface-raised p-3 text-step-sm">{copy.paymentPending}</p>
      )}
      <p className="mt-4 text-step-sm text-ink-2">{copy.lockedBody}</p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        <li className="flex flex-col gap-4 rounded-sm border border-line bg-surface-raised p-5">
          <ShoppingCart aria-hidden className="h-5 w-5 text-primary" />
          <p className="text-step-sm text-ink-2">{copy.buyOption(price)}</p>
          {signedIn ? (
            <Button className="mt-auto" onClick={() => void startCheckout()} disabled={pending} aria-busy={pending}>
              {copy.buyButton(price)}
            </Button>
          ) : (
            <Button asChild className="mt-auto">
              <Link href={signInHref}>{copy.signInToBuy}</Link>
            </Button>
          )}
        </li>
        <li className="flex flex-col gap-4 rounded-sm border border-line bg-surface-raised p-5">
          <Crown aria-hidden className="h-5 w-5 text-primary" />
          <p className="text-step-sm text-ink-2">{copy.vipOption}</p>
          <Button asChild variant="outline" className="mt-auto">
            <Link href={`${localizedPath("/", locale)}#pricing`}>{copy.vipButton}</Link>
          </Button>
        </li>
      </ul>
      {error && <p role="alert" className="mt-4 text-step-sm text-destructive">{error}</p>}
    </section>
  );
}
