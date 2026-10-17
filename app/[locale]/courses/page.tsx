import ChapterPlate from "@/components/constellation/chapter-plate";
import { CourseEmptyPlate } from "@/components/courses/course-empty-plate";
import { CourseVideoCard } from "@/components/courses/course-video-card";
import { CoursesSidebar } from "@/components/courses/courses-sidebar";
import { getDb } from "@/lib/db";
import { listPublishedVideos, toPublicCourseVideo } from "@/lib/courses/course-video-service";
import { getCoursesCopy, toCoursesLocale } from "@/lib/courses/courses-copy";
import { loadCoursesSidebar } from "@/lib/courses/sidebar/load-courses-sidebar";
import { pageMetadata, serializeJsonLd } from "@/lib/seo";
import { breadcrumbJsonLd, courseListJsonLd } from "@/lib/structured-data";
import "./courses-page.css";

export const dynamic = "force-dynamic";

const SIDEBAR_ID = "courses-aside";

interface CoursesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: CoursesPageProps) {
  const { locale } = await params;
  const copy = getCoursesCopy(locale);
  return pageMetadata({ title: copy.listTitle, description: copy.listSubtitle, path: "/courses", locale });
}

/** Chapter III · observatory as a page: published course videos, with a reading list from 200lab and ZueyOS. */
export default async function CoursesPage({ params }: CoursesPageProps) {
  const { locale } = await params;
  const copy = getCoursesCopy(locale);
  // The sidebar never rejects (failed sources become fallbacks), so it cannot take the page down.
  const [rows, sidebar] = await Promise.all([listPublishedVideos(getDb()), loadCoursesSidebar(toCoursesLocale(locale))]);
  const videos = rows.map(toPublicCourseVideo);
  const jsonLd = [
    breadcrumbJsonLd([{ name: "Next Level Builders", path: "/" }, { name: copy.listTitle, path: "/courses" }], locale),
    ...(videos.length ? [courseListJsonLd(videos.map((video) => ({ ...video, locale })), locale)] : []),
  ];

  return (
    <main id="main" className="courses-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="wrap">
        <header className="page-head">
          <ChapterPlate numeral="III" name={copy.plateName} coord="M42 · RA 05h 35m · Dec −05° 23′" />
          <h1 className="h1-page">
            {copy.headingLead}<em>{copy.headingAccent}</em>{copy.headingTail}
          </h1>
          <p className="lede">{copy.listSubtitle}</p>
        </header>
        <div className="courses-layout">
          <div className="courses-main">
            {videos.length === 0 ? (
              <CourseEmptyPlate locale={locale} resourcesId={SIDEBAR_ID} />
            ) : (
              <section aria-labelledby="courses-catalogue">
                <h2 id="courses-catalogue" className="mono courses-catalogue-head">
                  <span>{copy.catalogueLabel(videos.length)}</span><span className="rule" aria-hidden="true" />
                </h2>
                <ul className="cards courses-cards">
                  {videos.map((video, i) => (
                    <li key={video.id} className={i === 0 ? "courses-cards-feature" : undefined}>
                      <CourseVideoCard video={video} locale={locale} index={i} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <CoursesSidebar id={SIDEBAR_ID} data={sidebar} locale={locale} />
        </div>
      </div>
    </main>
  );
}
