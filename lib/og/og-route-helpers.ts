/**
 * Shared exports and copy for the `opengraph-image` routes under app/[locale].
 * Every route renders lib/og/constellation-og-card.tsx; this module keeps their config identical.
 */
import { getTranslations } from "next-intl/server";

export { OG_CONTENT_TYPE as contentType, OG_SIZE as size } from "./constellation-og-card";

export type OgLocale = "en" | "vi";

export const toOgLocale = (locale: string): OgLocale => (locale === "vi" ? "vi" : "en");

/** Header nav labels (messages: shell.nav), so card kickers match the site chrome in each locale. */
export async function navLabel(locale: string, key: "courses" | "directory" | "leaderboard" | "blog" | "buildWithUs"): Promise<string> {
  const t = await getTranslations({ locale: toOgLocale(locale), namespace: "shell.nav" });
  return t(key);
}

export const OG_COPY: Record<OgLocale, { readingTime: (minutes: number) => string; week: (n: number) => string; minutes: (n: number) => string; free: string; policies: string; community: string }> = {
  en: {
    readingTime: (minutes) => `${minutes} min read`,
    week: (n) => `Week ${n}`,
    minutes: (n) => `${n} min`,
    free: "Free",
    policies: "Policies",
    community: "Builder community",
  },
  vi: {
    readingTime: (minutes) => `${minutes} phút đọc`,
    week: (n) => `Tuần ${n}`,
    minutes: (n) => `${n} phút`,
    free: "Miễn phí",
    policies: "Chính sách",
    community: "Cộng đồng builder",
  },
};
