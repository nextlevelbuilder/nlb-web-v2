"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getLiveCopy, toLiveLocale } from "@/lib/live/live-copy";
import { liveApi, safeExternalUrl } from "./live-api-client";

interface LiveCheckoutDialogProps {
  slug: string;
  locale: string;
  eventTitle: string;
  price: string;
  recordingNotice: string;
  refundPolicy: string;
  signInHref: string;
}

/**
 * Consent step before a Live ticket checkout: shows the event's recording notice and refund policy,
 * requires the consent checkbox, then asks the member API for a Polar checkout URL and redirects.
 * Radix Dialog provides the focus trap, Esc and focus return; feedback is announced via role=alert.
 */
export function LiveCheckoutDialog({ slug, locale, eventTitle, price, recordingNotice, refundPolicy, signInHref }: LiveCheckoutDialogProps) {
  const copy = getLiveCopy(locale);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkboxId = useId();
  const hintId = useId();

  async function startCheckout() {
    if (!agreed || pending) return;
    setPending(true);
    setError(null);
    const result = await liveApi<{ url?: unknown }>(`/api/v1/live/events/${encodeURIComponent(slug)}/checkout`, {
      method: "POST",
      body: JSON.stringify({ recordingConsent: true, locale: toLiveLocale(locale) }),
    });
    if (result.ok) {
      const url = safeExternalUrl(result.data.url);
      if (url) {
        window.location.assign(url);
        return;
      }
      setError(copy.errors.checkout_failed);
      setPending(false);
      return;
    }
    if (result.code === "unauthenticated") {
      window.location.assign(signInHref);
      return;
    }
    setError(copy.errors[result.code]);
    setPending(false);
    // The page's server state (ticket, seats, sales) is stale for these answers.
    if (result.code === "already_ticketed" || result.code === "sold_out" || result.code === "sales_not_open") router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !pending) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="btn btn-primary live-cta-btn">{copy.buyTicket(price)}</button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.close} className="live-dialog max-h-[90svh] w-[calc(100%-2rem)] overflow-y-auto motion-reduce:animate-none">
        <DialogHeader className="pr-10">
          <DialogTitle className="font-display text-step-xl">{copy.consentTitle}</DialogTitle>
          <DialogDescription className="text-step-sm text-ink-2">{copy.consentIntro(eventTitle, price)}</DialogDescription>
        </DialogHeader>
        <div className="live-consent">
          <section className="live-consent-block" aria-labelledby={`${checkboxId}-rec`}>
            <h3 id={`${checkboxId}-rec`} className="mono">{copy.recordingNoticeHeading}</h3>
            <p>{recordingNotice}</p>
          </section>
          <section className="live-consent-block" aria-labelledby={`${checkboxId}-ref`}>
            <h3 id={`${checkboxId}-ref`} className="mono">{copy.refundPolicyHeading}</h3>
            <p>{refundPolicy || copy.refundPolicyFallback}</p>
          </section>
          <div className="live-consent-check">
            <input
              id={checkboxId}
              type="checkbox"
              checked={agreed}
              required
              aria-describedby={agreed ? undefined : hintId}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <label htmlFor={checkboxId}>{copy.consentCheckbox}</label>
          </div>
          {!agreed && <p id={hintId} className="live-hint">{copy.consentRequiredHint}</p>}
          <button
            type="button"
            className="btn btn-primary live-cta-btn"
            disabled={!agreed || pending}
            aria-busy={pending}
            onClick={() => void startCheckout()}
          >
            {pending ? copy.redirecting : copy.continueToCheckout}
          </button>
          <p className="live-feedback" role="alert" aria-live="assertive">{error}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
