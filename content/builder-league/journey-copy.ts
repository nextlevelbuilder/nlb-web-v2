import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League journey copy. Sections are added by the piece that owns this surface. */
export type JourneyCopy = Record<string, never>;

export const journeyCopy: Record<PageLocale, JourneyCopy> = {
  en: {},
  vi: {},
};

export function getJourneyCopy(locale: string): JourneyCopy {
  return journeyCopy[toPageLocale(locale)];
}
