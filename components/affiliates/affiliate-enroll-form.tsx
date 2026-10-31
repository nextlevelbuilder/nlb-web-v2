"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { affiliateRequest, errorKey } from "./affiliate-api";
import { useAffiliateErrorMessage } from "./use-affiliate-error";

/** Agreement acceptance for a signed-in member who has not joined yet (`POST /api/v1/affiliates/me`). */
export default function AffiliateEnrollForm({ termsVersion }: { termsVersion: string }) {
  const t = useTranslations("affiliateAccount.join");
  const errorMessage = useAffiliateErrorMessage();
  const router = useRouter();
  const checkboxId = useId();
  const feedbackId = useId();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!accepted) {
      setFeedback(t("required"));
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await affiliateRequest("/api/v1/affiliates/me", "POST", { termsVersion });
      router.refresh();
    } catch (error) {
      setFeedback(errorMessage(error));
      // Joined in another tab: the dashboard is already there.
      if (errorKey(error) === "already_enrolled") router.refresh();
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <label htmlFor={checkboxId} className="flex cursor-pointer items-start gap-3 text-step-sm text-foreground">
        <input
          id={checkboxId}
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          aria-describedby={feedbackId}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
        />
        <span>
          {t.rich("agree", {
            version: termsVersion,
            agreement: (chunks) => (
              <Link href="/policies/affiliate-agreement" target="_blank" className="text-primary underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      <Button type="submit" size="lg" loading={busy} className="w-full sm:w-auto">
        {t("submit")}
      </Button>
      <p id={feedbackId} role="status" className="min-h-0 text-step-sm text-destructive empty:hidden">
        {feedback}
      </p>
    </form>
  );
}
