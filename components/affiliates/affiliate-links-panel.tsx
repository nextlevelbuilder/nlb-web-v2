"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pause, Pencil, Play, Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { affiliateRequest } from "./affiliate-api";
import AffiliateCopyButton from "./affiliate-copy-button";
import { formatBps } from "./affiliate-format";
import AffiliateLinkForm from "./affiliate-link-form";
import type { AffiliateLinkView } from "./affiliate-types";
import { useAffiliateErrorMessage } from "./use-affiliate-error";

interface AffiliateLinksPanelProps {
  links: AffiliateLinkView[];
  budgetBps: number;
  currency: string;
  examplePriceMinor: number;
  maxLinks: number;
  /** Suspended affiliates see their links read-only. */
  readOnly: boolean;
}

const STATUS_CLASS: Record<string, string> = {
  active: "border-success/50 text-success",
  paused: "border-warning/50 text-warning",
  archived: "border-line-strong text-ink-3",
};

/** The affiliate's links with copy, stats and editing; one form open at a time. */
export default function AffiliateLinksPanel({ links, budgetBps, currency, examplePriceMinor, maxLinks, readOnly }: AffiliateLinksPanelProps) {
  const t = useTranslations("affiliateAccount.links");
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useAffiliateErrorMessage();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ message: string; error: boolean } | null>(null);

  const canCreate = !readOnly && links.length < maxLinks;
  const done = (message: string) => {
    setEditing(null);
    setStatus({ message, error: false });
  };

  const toggle = async (link: AffiliateLinkView) => {
    if (busyId) return;
    setBusyId(link.id);
    setStatus(null);
    try {
      await affiliateRequest(`/api/v1/affiliates/links/${encodeURIComponent(link.id)}`, "PATCH", {
        status: link.status === "active" ? "paused" : "active",
        expectedVersion: link.version,
      });
      router.refresh();
      setStatus({ message: t("statusChanged"), error: false });
    } catch (error) {
      setStatus({ message: errorMessage(error), error: true });
    } finally {
      setBusyId(null);
    }
  };

  const formProps = { budgetBps, currency, examplePriceMinor, onDone: done, onCancel: () => setEditing(null) };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-step-xs text-ink-3">{t("limit", { max: maxLinks })}</p>
        {canCreate && editing !== "new" && (
          <Button type="button" size="sm" className="gap-1.5" onClick={() => { setEditing("new"); setStatus(null); }}>
            <Plus aria-hidden />
            {t("new")}
          </Button>
        )}
      </div>

      {editing === "new" && <AffiliateLinkForm {...formProps} />}

      {links.length === 0 ? (
        <p className="rounded-sm border border-line bg-surface p-6 text-center text-step-sm text-ink-2">{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {links.map((link) => {
            const clamped = link.discountBps > budgetBps;
            return (
              <li key={link.id} className="space-y-4 rounded-sm border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-display text-step-lg text-foreground">{link.label || link.code}</p>
                    <p className="font-mono text-step-xs text-ink-3">{link.destinationPath}{link.utmCampaign ? ` · ${link.utmCampaign}` : ""}</p>
                  </div>
                  <Badge variant="outline" className={STATUS_CLASS[link.status] ?? STATUS_CLASS.archived}>
                    {t(`statuses.${link.status}`)}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <code className="min-w-0 flex-1 break-all rounded-sm border border-line bg-canvas-deep px-3 py-2 font-mono text-step-sm text-foreground">
                    {link.url}
                  </code>
                  <AffiliateCopyButton text={link.url} code={link.code} />
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  {[
                    { label: t("discount"), value: formatBps(link.discountBps, locale) },
                    { label: t("commission"), value: formatBps(link.commissionBps, locale) },
                    { label: t("clicks"), value: new Intl.NumberFormat(locale).format(link.clicks) },
                    { label: t("conversions"), value: new Intl.NumberFormat(locale).format(link.conversions) },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <dt className="mono-label text-ink-3">{item.label}</dt>
                      <dd className="num-tab font-display text-step-lg text-foreground">{item.value}</dd>
                    </div>
                  ))}
                </dl>
                {clamped && <p className="text-step-xs text-warning">{t("clamped", { discount: formatBps(budgetBps, locale) })}</p>}

                {!readOnly && link.status !== "archived" && editing !== link.id && (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" aria-label={t("editLabel", { code: link.code })} onClick={() => { setEditing(link.id); setStatus(null); }}>
                      <Pencil aria-hidden />
                      <span aria-hidden>{t("edit")}</span>
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" loading={busyId === link.id} onClick={() => toggle(link)}>
                      {link.status === "active" ? <Pause aria-hidden /> : <Play aria-hidden />}
                      {link.status === "active" ? t("pause") : t("resume")}
                    </Button>
                  </div>
                )}
                {editing === link.id && <AffiliateLinkForm {...formProps} link={link} />}
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" className={`min-h-0 text-step-sm empty:hidden ${status?.error ? "text-destructive" : "text-success"}`}>
        {status?.message}
      </p>
    </div>
  );
}
