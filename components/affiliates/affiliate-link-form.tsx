"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { MEMBERSHIP_PLAN_NAMES } from "@/lib/constants/launch";
import { maxCommissionBps, previewIncentive } from "@/lib/referrals/program-math";
import type { AffiliateLinkStatus } from "@/lib/referrals/types";
import { affiliateRequest } from "./affiliate-api";
import { DESTINATION_KEYS, destinationPath, parseDestination, type DestinationKey, type DestinationLanguage } from "./affiliate-destinations";
import { formatBps, formatMoney } from "./affiliate-format";
import type { AffiliateLinkView } from "./affiliate-types";
import { useAffiliateErrorMessage } from "./use-affiliate-error";

export const fieldClass =
  "w-full rounded-sm border border-input bg-background px-3 py-2.5 text-step-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const labelClass = "block text-step-sm font-medium text-foreground";
export const hintClass = "mt-1 text-step-xs text-ink-2";

const SLIDER_STEP_BPS = 50;
const CUSTOM_DESTINATION = "custom";

interface AffiliateLinkFormProps {
  /** Present when editing; absent when creating. */
  link?: AffiliateLinkView;
  budgetBps: number;
  currency: string;
  /** List price used for the live preview (minor units). */
  examplePriceMinor: number;
  onDone: (message: string) => void;
  onCancel: () => void;
}

/**
 * Create or edit a link: label, code (create only), landing page, campaign tag, status (edit only) and
 * the buyer discount, bounded by the budget, with the resulting commission previewed as it moves.
 */
export default function AffiliateLinkForm({ link, budgetBps, currency, examplePriceMinor, onDone, onCancel }: AffiliateLinkFormProps) {
  const t = useTranslations("affiliateAccount.form");
  const tLinks = useTranslations("affiliateAccount.links");
  const locale = useLocale();
  const errorMessage = useAffiliateErrorMessage();
  const router = useRouter();
  const id = useId();

  const parsed = link ? parseDestination(link.destinationPath) : null;
  const [label, setLabel] = useState(link?.label ?? "");
  const [code, setCode] = useState("");
  const [destination, setDestination] = useState<DestinationKey | typeof CUSTOM_DESTINATION>(link && !parsed ? CUSTOM_DESTINATION : (parsed?.key ?? "pricing"));
  const [language, setLanguage] = useState<DestinationLanguage>(parsed?.language ?? (locale === "vi" ? "vi" : "en"));
  const [utm, setUtm] = useState(link?.utmCampaign ?? "");
  const [status, setStatus] = useState<AffiliateLinkStatus>((link?.status as AffiliateLinkStatus) ?? "active");
  const [discountBps, setDiscountBps] = useState(Math.min(link?.discountBps ?? 0, budgetBps));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commissionBps = maxCommissionBps(discountBps, budgetBps);
  const preview = useMemo(() => previewIncentive(examplePriceMinor, discountBps, commissionBps), [examplePriceMinor, discountBps, commissionBps]);
  const money = (minor: number) => formatMoney(minor, currency, locale);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const path = destination === CUSTOM_DESTINATION ? link?.destinationPath ?? "/" : destinationPath(destination, language);
    try {
      if (link) {
        const patch: Record<string, unknown> = { expectedVersion: link.version };
        if (label.trim() !== (link.label ?? "")) patch.label = label.trim();
        if (path !== link.destinationPath) patch.destinationPath = path;
        if (utm.trim().toLowerCase() !== (link.utmCampaign ?? "")) patch.utmCampaign = utm.trim().toLowerCase();
        if (status !== link.status) patch.status = status;
        if (discountBps !== link.discountBps) patch.discountBps = discountBps;
        await affiliateRequest(`/api/v1/affiliates/links/${encodeURIComponent(link.id)}`, "PATCH", patch);
      } else {
        await affiliateRequest("/api/v1/affiliates/links", "POST", {
          ...(code.trim() ? { code: code.trim().toLowerCase() } : {}),
          ...(label.trim() ? { label: label.trim() } : {}),
          ...(utm.trim() ? { utmCampaign: utm.trim().toLowerCase() } : {}),
          destinationPath: path,
          discountBps,
        });
      }
      router.refresh();
      onDone(link ? t("saved") : t("created"));
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  const headingId = `${id}-heading`;
  return (
    <form onSubmit={submit} aria-labelledby={headingId} className="space-y-5 rounded-sm border border-line-strong bg-canvas-deep p-5 sm:p-6" noValidate>
      <h3 id={headingId} className="font-display text-step-lg">
        {link ? t("editTitle", { code: link.code }) : t("createTitle")}
      </h3>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor={`${id}-label`} className={labelClass}>{t("label")}</label>
          <input id={`${id}-label`} className={`${fieldClass} mt-2`} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} aria-describedby={`${id}-label-hint`} />
          <p id={`${id}-label-hint`} className={hintClass}>{t("labelHint")}</p>
        </div>
        {!link && (
          <div>
            <label htmlFor={`${id}-code`} className={labelClass}>{t("code")}</label>
            <input
              id={`${id}-code`}
              className={`${fieldClass} mt-2 font-mono`}
              value={code}
              maxLength={32}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              pattern="[a-z0-9-]{4,32}"
              onChange={(e) => setCode(e.target.value.toLowerCase())}
              aria-describedby={`${id}-code-hint`}
            />
            <p id={`${id}-code-hint`} className={hintClass}>{t("codeHint")}</p>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-destination`} className={labelClass}>{t("destination")}</label>
          <select id={`${id}-destination`} className={`${fieldClass} mt-2`} value={destination} onChange={(e) => setDestination(e.target.value as DestinationKey | typeof CUSTOM_DESTINATION)}>
            {DESTINATION_KEYS.map((key) => (
              <option key={key} value={key}>{t(`destinations.${key}`)}</option>
            ))}
            {link && !parsed && <option value={CUSTOM_DESTINATION}>{link.destinationPath}</option>}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-language`} className={labelClass}>{t("language")}</label>
          <select
            id={`${id}-language`}
            className={`${fieldClass} mt-2`}
            value={language}
            disabled={destination === CUSTOM_DESTINATION}
            onChange={(e) => setLanguage(e.target.value === "vi" ? "vi" : "en")}
          >
            <option value="en">{t("languages.en")}</option>
            <option value="vi">{t("languages.vi")}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-utm`} className={labelClass}>{t("utm")}</label>
          <input
            id={`${id}-utm`}
            className={`${fieldClass} mt-2 font-mono`}
            value={utm}
            maxLength={64}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setUtm(e.target.value)}
            aria-describedby={`${id}-utm-hint`}
          />
          <p id={`${id}-utm-hint`} className={hintClass}>{t("utmHint")}</p>
        </div>
        {link && (
          <div>
            <label htmlFor={`${id}-status`} className={labelClass}>{t("status")}</label>
            <select id={`${id}-status`} className={`${fieldClass} mt-2`} value={status} onChange={(e) => setStatus(e.target.value as AffiliateLinkStatus)}>
              {(["active", "paused", "archived"] as const).map((value) => (
                <option key={value} value={value}>{tLinks(`statuses.${value}`)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-sm border border-line bg-surface p-4">
        <label htmlFor={`${id}-discount`} className={labelClass}>{t("discount", { discount: formatBps(discountBps, locale) })}</label>
        <input
          id={`${id}-discount`}
          type="range"
          min={0}
          max={budgetBps}
          step={SLIDER_STEP_BPS}
          value={discountBps}
          onChange={(e) => setDiscountBps(Math.max(0, Math.min(budgetBps, Number(e.target.value) || 0)))}
          aria-valuetext={formatBps(discountBps, locale)}
          aria-describedby={`${id}-discount-hint ${id}-preview`}
          className="h-6 w-full accent-primary"
        />
        <p id={`${id}-discount-hint`} className={hintClass}>{t("discountHint", { budget: formatBps(budgetBps, locale) })}</p>
        <div id={`${id}-preview`} aria-live="polite" className="space-y-1 border-t border-line pt-3">
          <p className="mono-label text-ink-3">{t("previewTitle")}</p>
          <p className="font-display text-step-lg text-primary">{t("previewCommission", { rate: formatBps(commissionBps, locale) })}</p>
          <p className="text-step-sm text-ink-2">
            {t("previewExample", {
              plan: MEMBERSHIP_PLAN_NAMES.premium,
              price: money(preview.priceMinor),
              pays: money(preview.buyerPaysMinor),
              earn: money(preview.commissionMinor),
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>{link ? t("save") : t("create")}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{t("cancel")}</Button>
      </div>
      <p role="alert" className="min-h-0 text-step-sm text-destructive empty:hidden">{error}</p>
    </form>
  );
}
