import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";

/** Builder League leaderboard copy. Sections are added by the piece that owns this surface. */
export type LeaderboardCopy = Record<string, never>;

export const leaderboardCopy: Record<PageLocale, LeaderboardCopy> = {
  en: {},
  vi: {},
};

export function getLeaderboardCopy(locale: string): LeaderboardCopy {
  return leaderboardCopy[toPageLocale(locale)];
}
