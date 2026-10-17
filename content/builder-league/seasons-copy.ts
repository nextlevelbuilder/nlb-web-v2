import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League seasons copy. Sections are added by the piece that owns this surface. */
export type SeasonsCopy = Record<string, never>;

export const seasonsCopy: Record<PageLocale, SeasonsCopy> = {
  en: {},
  vi: {},
};

export function getSeasonsCopy(locale: string): SeasonsCopy {
  return seasonsCopy[toPageLocale(locale)];
}
