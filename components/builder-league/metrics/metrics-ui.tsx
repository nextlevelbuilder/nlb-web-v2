import type { ReactNode } from "react";
import type { Ratio } from "@/lib/builder-league/metrics";

/** Number formatting for the metrics dashboard (server only, no client state). */
export interface MetricsFormat {
  int: (value: number) => string;
  decimal: (value: number | null) => string;
  percent: (value: number | null) => string;
  ratio: (value: Ratio) => string;
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
}

export function createMetricsFormat(locale: string, none: string): MetricsFormat {
  const tag = locale === "vi" ? "vi-VN" : "en-GB";
  const int = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "Asia/Saigon" });
  const dateTime = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Saigon" });
  return {
    int: (value) => int.format(value),
    decimal: (value) => (value === null ? none : decimal.format(value)),
    percent: (value) => (value === null ? none : percent.format(value)),
    ratio: (value) => `${int.format(value.numerator)} / ${int.format(value.denominator)}`,
    date: (iso) => date.format(new Date(iso)),
    dateTime: (iso) => dateTime.format(new Date(iso)),
  };
}

/** One dashboard section: numbered mono label, heading, the basis of the numbers, then the content. */
export function MetricsSection({ id, numeral, title, basis, children }: { id: string; numeral: string; title: string; basis: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 border-t border-line pt-8">
      <div className="space-y-2">
        <p className="mono-label text-ink-3" aria-hidden="true">
          {numeral}
        </p>
        <h2 id={`${id}-title`} className="font-display text-step-2xl font-light text-balance">
          {title}
        </h2>
        <p className="max-w-[70ch] text-step-sm text-ink-2">{basis}</p>
      </div>
      {children}
    </section>
  );
}

/** A headline rate with its fraction underneath. */
export function RatioStat({ label, value, format, note }: { label: string; value: Ratio; format: MetricsFormat; note?: string }) {
  return (
    <div className="surface-panel min-w-0 p-5">
      <dt className="mono-label text-ink-3">{label}</dt>
      <dd className="mt-2 space-y-1">
        <span className="num-tab block font-display text-step-2xl text-foreground">{format.percent(value.rate)}</span>
        <span className="num-tab block text-step-sm text-ink-2">{format.ratio(value)}</span>
        {note ? <span className="block text-step-xs text-ink-3">{note}</span> : null}
      </dd>
    </div>
  );
}

/** A plain count. */
export function CountStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="surface-panel min-w-0 p-5">
      <dt className="mono-label text-ink-3">{label}</dt>
      <dd className="mt-2 space-y-1">
        <span className="num-tab block font-display text-step-xl text-foreground">{value}</span>
        {note ? <span className="block text-step-xs text-ink-3">{note}</span> : null}
      </dd>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;
}

/**
 * A data table in a keyboard-focusable scroll region, so wide tables scroll inside the region at 320 px
 * instead of widening the page.
 */
export function DataTable({ caption, head, rows, empty }: { caption: string; head: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="rounded-sm border border-line px-4 py-3 text-step-sm text-ink-2">{empty}</p>;
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-sm border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <table className="w-full min-w-[32rem] border-collapse text-left text-step-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {head.map((label, index) => (
              <th key={label} scope="col" className={`mono-label px-3 py-2 font-normal text-ink-3 ${index === 0 ? "" : "text-right"}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex} className="border-b border-line last:border-b-0">
              {cells.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="px-3 py-2 font-normal text-foreground">
                    {cell}
                  </th>
                ) : (
                  <td key={index} className="num-tab whitespace-nowrap px-3 py-2 text-right text-ink-2">
                    {cell}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `3 / 5 · 60%` in one table cell. */
export function RatioCell({ value, format }: { value: Ratio; format: MetricsFormat }) {
  return (
    <>
      {format.ratio(value)} <span className="text-ink-3">· {format.percent(value.rate)}</span>
    </>
  );
}
