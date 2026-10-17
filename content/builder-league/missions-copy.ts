import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League missions copy. Sections are added by the piece that owns this surface. */
export type MissionsCopy = Record<string, never>;

export const missionsCopy: Record<PageLocale, MissionsCopy> = {
  en: {},
  vi: {},
};

export function getMissionsCopy(locale: string): MissionsCopy {
  return missionsCopy[toPageLocale(locale)];
}
