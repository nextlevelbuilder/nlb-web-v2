/** Minimal public shape of a published course video for the homepage cards. */
export interface HomeCourseVideo {
  slug: string;
  title: string;
  locale: 'en' | 'vi';
  weekNumber: number | null;
  durationSec: number;
  priceCents: number;
  currency: string;
  thumbnailUrl: string | null;
  publishedAt: number | null;
}

export const HOME_COURSE_CARDS = 3;

/** The latest videos (highest week, then newest), preferring the visitor's language. */
export function pickLatestCourseVideos(videos: HomeCourseVideo[], locale: string, count = HOME_COURSE_CARDS): HomeCourseVideo[] {
  const latestFirst = [...videos].sort((a, b) =>
    (b.weekNumber ?? -1) - (a.weekNumber ?? -1) || (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  const preferred = latestFirst.filter((v) => v.locale === locale);
  const others = latestFirst.filter((v) => v.locale !== locale);
  return [...preferred, ...others].slice(0, count);
}
