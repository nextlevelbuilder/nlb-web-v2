import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { MEMBERSHIP_PLAN_NAMES } from "@/lib/constants/launch";
import { formatBps, formatDate, formatMoney } from "./affiliate-format";
import type { AffiliateConversionView, AffiliateLedgerView, AffiliatePayoutView } from "./affiliate-types";

function HistoryTable({ caption, minWidth, head, children }: { caption: string; minWidth: string; head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-line bg-surface" role="region" aria-label={caption} tabIndex={0}>
      <table className="w-full text-left text-step-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-raised">
          <tr className="mono-label text-ink-3">{head}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

const th = "p-3 font-normal";
const thRight = "p-3 text-right font-normal";
const td = "p-3 text-ink-2";
const tdNum = "num-tab p-3 text-right text-foreground";

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-sm border border-line bg-surface p-6 text-center text-step-sm text-ink-2">{children}</p>;
}

/** First-membership conversions: dates, plan and amounts only, never who bought. */
export async function AffiliateConversionsTable({ conversions, locale }: { conversions: AffiliateConversionView[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: "affiliateAccount.conversions" });
  if (conversions.length === 0) return <Empty>{t("empty")}</Empty>;
  return (
    <HistoryTable
      caption={t("title")}
      minWidth="44rem"
      head={
        <>
          <th scope="col" className={th}>{t("date")}</th>
          <th scope="col" className={th}>{t("plan")}</th>
          <th scope="col" className={thRight}>{t("paid")}</th>
          <th scope="col" className={thRight}>{t("rate")}</th>
          <th scope="col" className={thRight}>{t("commission")}</th>
          <th scope="col" className={thRight}>{t("refunded")}</th>
          <th scope="col" className={th}>{t("status")}</th>
          <th scope="col" className={th}>{t("matures")}</th>
        </>
      }
    >
      {conversions.map((row) => (
        <tr key={row.id}>
          <td className={td}><time dateTime={row.paidAt}>{formatDate(row.paidAt, locale)}</time></td>
          <td className="p-3 text-foreground">{row.plan ? MEMBERSHIP_PLAN_NAMES[row.plan] : t("planUnknown")}</td>
          <td className={tdNum}>{formatMoney(row.netMinor, row.currency, locale)}</td>
          <td className={tdNum}>{formatBps(row.commissionBps, locale)}</td>
          <td className={`${tdNum} text-primary`}>{formatMoney(row.commissionMinor, row.currency, locale)}</td>
          <td className={tdNum}>{row.refundedNetMinor > 0 ? formatMoney(row.refundedNetMinor, row.currency, locale) : "—"}</td>
          <td className="p-3"><Badge variant="outline">{t(`statuses.${row.status}`)}</Badge></td>
          <td className={td}><time dateTime={row.maturesAt}>{formatDate(row.maturesAt, locale)}</time></td>
        </tr>
      ))}
    </HistoryTable>
  );
}

/** Ledger movements between balance buckets, newest first. */
export async function AffiliateLedgerTable({ entries, locale }: { entries: AffiliateLedgerView[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: "affiliateAccount.ledger" });
  if (entries.length === 0) return <Empty>{t("empty")}</Empty>;
  const bucket = (value: string | null) => (value ? t(`buckets.${value}`) : t("outside"));
  return (
    <HistoryTable
      caption={t("title")}
      minWidth="36rem"
      head={
        <>
          <th scope="col" className={th}>{t("date")}</th>
          <th scope="col" className={th}>{t("entry")}</th>
          <th scope="col" className={th}>{t("movement")}</th>
          <th scope="col" className={thRight}>{t("amount")}</th>
        </>
      }
    >
      {entries.map((row) => (
        <tr key={row.id}>
          <td className={td}><time dateTime={row.createdAt}>{formatDate(row.createdAt, locale)}</time></td>
          <td className="p-3 text-foreground">{t(`kinds.${row.kind}`)}</td>
          <td className={td}>
            {bucket(row.from)} <span aria-hidden>→</span> {bucket(row.to)}
          </td>
          <td className={tdNum}>{formatMoney(row.amountMinor, row.currency, locale)}</td>
        </tr>
      ))}
    </HistoryTable>
  );
}

/** Payout items of the affiliate, by period. */
export async function AffiliatePayoutsTable({ payouts, currency, locale }: { payouts: AffiliatePayoutView[]; currency: string; locale: string }) {
  const t = await getTranslations({ locale, namespace: "affiliateAccount.payouts" });
  if (payouts.length === 0) return <Empty>{t("empty")}</Empty>;
  const money = (minor: number) => formatMoney(minor, currency, locale);
  return (
    <HistoryTable
      caption={t("title")}
      minWidth="44rem"
      head={
        <>
          <th scope="col" className={th}>{t("period")}</th>
          <th scope="col" className={th}>{t("method")}</th>
          <th scope="col" className={thRight}>{t("gross")}</th>
          <th scope="col" className={thRight}>{t("fee")}</th>
          <th scope="col" className={thRight}>{t("withholding")}</th>
          <th scope="col" className={thRight}>{t("net")}</th>
          <th scope="col" className={th}>{t("status")}</th>
          <th scope="col" className={th}>{t("paidAt")}</th>
        </>
      }
    >
      {payouts.map((row) => (
        <tr key={row.id}>
          <td className="num-tab p-3 text-foreground">{row.period ?? "—"}</td>
          <td className={td}>{t(`methods.${row.methodType}`)}</td>
          <td className={tdNum}>{money(row.grossMinor)}</td>
          <td className={tdNum}>{money(row.serviceFeeMinor)}</td>
          <td className={tdNum}>{money(row.withholdingMinor)}</td>
          <td className={`${tdNum} text-primary`}>{money(row.netMinor)}</td>
          <td className="p-3"><Badge variant="outline">{t(`statuses.${row.status}`)}</Badge></td>
          <td className={td}>{row.paidAt ? <time dateTime={row.paidAt}>{formatDate(row.paidAt, locale)}</time> : "—"}</td>
        </tr>
      ))}
    </HistoryTable>
  );
}
