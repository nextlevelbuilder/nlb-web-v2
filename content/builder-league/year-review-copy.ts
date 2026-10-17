import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League year-review copy. Sections are added by the piece that owns this surface. */
export type YearReviewCopy = Record<string, never>;

export const yearReviewCopy: Record<PageLocale, YearReviewCopy> = {
  en: {},
  vi: {},
};

export function getYearReviewCopy(locale: string): YearReviewCopy {
  return yearReviewCopy[toPageLocale(locale)];
}
