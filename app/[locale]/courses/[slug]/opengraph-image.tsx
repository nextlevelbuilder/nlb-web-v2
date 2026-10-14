import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { getDb } from "@/lib/db";
import { courseSlugSchema } from "@/lib/courses/course-video-schemas";
import { getPublishedVideoBySlug } from "@/lib/courses/course-video-service";
import { formatCoursePrice } from "@/lib/courses/courses-copy";
import { navLabel, OG_COPY, toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders course video";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const kicker = await navLabel(locale, "courses");
  const video = courseSlugSchema.safeParse(slug).success ? await getPublishedVideoBySlug(slug, getDb()) : null;
  if (!video) return renderConstellationOgCard({ numeral: "III", kicker, title: "Next Level Builders" });
  const copy = OG_COPY[toOgLocale(locale)];
  const meta = [
    video.weekNumber !== null ? copy.week(video.weekNumber) : "",
    video.durationSec > 0 ? copy.minutes(Math.max(1, Math.round(video.durationSec / 60))) : "",
    formatCoursePrice(video.priceCents, video.currency, locale),
  ];
  return renderConstellationOgCard({ numeral: "III", kicker, title: video.title, subtitle: video.description, meta });
}
