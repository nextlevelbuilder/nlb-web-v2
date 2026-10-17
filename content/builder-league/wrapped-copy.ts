import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League wrapped copy. Sections are added by the piece that owns this surface. */
export type WrappedCopy = Record<string, never>;

export const wrappedCopy: Record<PageLocale, WrappedCopy> = {
  en: {},
  vi: {},
};

export function getWrappedCopy(locale: string): WrappedCopy {
  return wrappedCopy[toPageLocale(locale)];
}
