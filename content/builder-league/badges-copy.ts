import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League badges copy. Sections are added by the piece that owns this surface. */
export type BadgesCopy = Record<string, never>;

export const badgesCopy: Record<PageLocale, BadgesCopy> = {
  en: {},
  vi: {},
};

export function getBadgesCopy(locale: string): BadgesCopy {
  return badgesCopy[toPageLocale(locale)];
}
