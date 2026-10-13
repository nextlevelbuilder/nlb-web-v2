import type { PageLocale } from "./page-locale";

/** Small directory strings that have no key in messages/*.json. */
export type DirectoryCopy = {
  votes: (count: number) => string;
  points: (score: number) => string;
  visitSite: (name: string) => string;
  opensInNewTab: string;
  rankLabel: (rank: number) => string;
};

export const directoryCopy: Record<PageLocale, DirectoryCopy> = {
  en: {
    votes: (count) => `${count.toLocaleString("en-US")} ${count === 1 ? "vote" : "votes"}`,
    points: (score) => `${score.toLocaleString("en-US")} pts`,
    visitSite: (name) => `Visit ${name} website`,
    opensInNewTab: "(opens in a new tab)",
    rankLabel: (rank) => `Rank ${rank}`,
  },
  vi: {
    votes: (count) => `${count.toLocaleString("vi-VN")} lượt bình chọn`,
    points: (score) => `${score.toLocaleString("vi-VN")} điểm`,
    visitSite: (name) => `Truy cập website ${name}`,
    opensInNewTab: "(mở trong tab mới)",
    rankLabel: (rank) => `Hạng ${rank}`,
  },
};
