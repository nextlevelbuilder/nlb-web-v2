import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League home copy. Sections are added by the piece that owns this surface. */
export type HomeCopy = Record<string, never>;

export const homeCopy: Record<PageLocale, HomeCopy> = {
  en: {},
  vi: {},
};

export function getHomeCopy(locale: string): HomeCopy {
  return homeCopy[toPageLocale(locale)];
}
