"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

/** Copies a referral URL; the result is announced politely. */
export default function AffiliateCopyButton({ text, code }: { text: string; code: string }) {
  const t = useTranslations("affiliateAccount.links");
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const reset = setTimeout(() => setState("idle"), 2400);
    return () => clearTimeout(reset);
  }, [state]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch (error) {
      console.warn("Clipboard write failed:", error);
      setState("failed");
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={copy} aria-label={t("copyLabel", { code })}>
        {state === "copied" ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
        <span aria-hidden>{t("copy")}</span>
      </Button>
      <span role="status" className="sr-only">
        {state === "copied" ? t("copied") : state === "failed" ? t("copyFailed") : ""}
      </span>
    </>
  );
}
