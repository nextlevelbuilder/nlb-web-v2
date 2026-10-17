import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League evidence copy. Sections are added by the piece that owns this surface. */
export type EvidenceCopy = Record<string, never>;

export const evidenceCopy: Record<PageLocale, EvidenceCopy> = {
  en: {},
  vi: {},
};

export function getEvidenceCopy(locale: string): EvidenceCopy {
  return evidenceCopy[toPageLocale(locale)];
}
