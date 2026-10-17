import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League passport copy. Sections are added by the piece that owns this surface. */
export type PassportCopy = Record<string, never>;

export const passportCopy: Record<PageLocale, PassportCopy> = {
  en: {},
  vi: {},
};

export function getPassportCopy(locale: string): PassportCopy {
  return passportCopy[toPageLocale(locale)];
}
