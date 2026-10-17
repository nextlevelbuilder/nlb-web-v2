import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ChapterPlate from "@/components/constellation/chapter-plate";
import { CourseLockedPanel } from "@/components/courses/course-locked-panel";
import { CourseVideoPlayer } from "@/components/courses/course-video-player";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { canWatchVideo } from "@/lib/courses/course-video-access";
import { courseSlugSchema } from "@/lib/courses/course-video-schemas";
import { getPublishedVideoBySlug } from "@/lib/courses/course-video-service";
import { formatCoursePrice, getCoursesCopy } from "@/lib/courses/courses-copy";
import { localizedPath, pageMetadata, serializeJsonLd } from "@/lib/seo";
import { breadcrumbJsonLd, courseJsonLd } from "@/lib/structured-data";
import "../courses-page.css";

export const dynamic = "force-dynamic";

interface CourseVideoPageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadVideo(slug: string) {
  if (!courseSlugSchema.safeParse(slug).success) return null;
  return getPublishedVideoBySlug(slug, getDb());
}

const ROMAN: ReadonlyArray<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** Week number as the plate's roman numeral; unnumbered videos keep the courses chapter numeral. */
function plateNumeral(week: number | null): string {
  if (week === null || !Number.isInteger(week) || week < 1 || week > 3999) return "III";
  let rest = week;
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

export async function generateMetadata({ params }: CourseVideoPageProps) {
  const { locale, slug } = await params;
  const video = await loadVideo(slug);
  if (!video) return { title: "Video not found", robots: { index: false } };
  return pageMetadata({ title: video.title, description: video.description || video.title, path: `/courses/${slug}`, locale });
}

export default async function CourseVideoPage({ params, searchParams }: CourseVideoPageProps) {
  const { locale, slug } = await params;
  const video = await loadVideo(slug);
  if (!video) notFound();

  const copy = getCoursesCopy(locale);
  const caller = await resolveCaller(await headers());
  const hasAccess = caller ? await canWatchVideo(caller.user.id, video, getDb()) : false;
  const paymentReturned = (await searchParams).payment === "success";
  const minutes = Math.max(1, Math.round(video.durationSec / 60));
  const plateName = video.weekNumber !== null ? `${copy.detailPlate} · ${copy.week(video.weekNumber)}` : copy.detailPlate;

  const jsonLd = [
    courseJsonLd({ slug: video.slug, title: video.title, description: video.description, locale, priceCents: video.priceCents, currency: video.currency, durationSec: video.durationSec }),
    breadcrumbJsonLd([{ name: "Next Level Builders", path: "/" }, { name: copy.listTitle, path: "/courses" }, { name: video.title, path: `/courses/${video.slug}` }], locale),
  ];

  return (
    <main id="main" className="courses-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="wrap">
        <header className="page-head">
          <Link href={localizedPath("/courses", locale)} className="link-arrow courses-back">
            <span aria-hidden="true">←</span> {copy.back}
          </Link>
          <ChapterPlate numeral={plateNumeral(video.weekNumber)} name={plateName} coord="M42 · RA 05h 35m · Dec −05° 23′" />
          <h1 className="h1-page">{video.title}</h1>
          <p className="mono courses-detail-meta">
            {video.weekNumber !== null && <><span>{copy.week(video.weekNumber)}</span><span aria-hidden="true">·</span></>}
            {video.durationSec > 0 && <><span>{copy.minutes(minutes)}</span><span aria-hidden="true">·</span></>}
            <span className="courses-detail-price">{formatCoursePrice(video.priceCents, video.currency, locale)}</span>
          </p>
        </header>
        <div className="surface courses-stage">
          {hasAccess ? (
            <CourseVideoPlayer slug={video.slug} title={video.title} locale={locale} />
          ) : (
            <CourseLockedPanel
              slug={video.slug}
              priceCents={video.priceCents}
              currency={video.currency}
              locale={locale}
              signedIn={Boolean(caller)}
              paymentReturned={paymentReturned}
            />
          )}
        </div>
        {video.description && <p className="courses-detail-desc">{video.description}</p>}
      </div>
    </main>
  );
}
