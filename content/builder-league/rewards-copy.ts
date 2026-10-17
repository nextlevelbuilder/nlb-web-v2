import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League rewards copy. Sections are added by the piece that owns this surface. */
export type RewardsCopy = Record<string, never>;

export const rewardsCopy: Record<PageLocale, RewardsCopy> = {
  en: {},
  vi: {},
};

export function getRewardsCopy(locale: string): RewardsCopy {
  return rewardsCopy[toPageLocale(locale)];
}
