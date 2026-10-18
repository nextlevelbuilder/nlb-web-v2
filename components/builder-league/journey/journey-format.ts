import { BUILDER_TIME_ZONE } from "@/lib/builder-league/time-windows";

const intlLocale = (locale: string) => (locale === "vi" ? "vi-VN" : "en-GB");

/** Calendar date in the league's time zone (UTC+7), e.g. "3 Oct 2026" / "3 thg 10, 2026". */
export function formatLocalDate(locale: string, at: number | Date): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: BUILDER_TIME_ZONE }).format(at);
}

/** Month heading from a `YYYY-MM` key. */
export function formatMonthKey(locale: string, key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(year, month - 1, 15));
}

/** Formats a `YYYY-MM-DD` local date key without shifting it across time zones. */
export function formatDateKey(locale: string, key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(Date.UTC(year, month - 1, day));
}

export function formatNumber(locale: string, n: number): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(n);
}
