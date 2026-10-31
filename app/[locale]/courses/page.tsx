import ChapterPlate from "@/components/constellation/chapter-plate";
import { CourseEmptyPlate } from "@/components/courses/course-empty-plate";
import { CourseVideoCard } from "@/components/courses/course-video-card";
import { CoursesCatalogueControls, CoursesPagination } from "@/components/courses/courses-catalogue-controls";
import { CoursesSidebar } from "@/components/courses/courses-sidebar";
import { getDb } from "@/lib/db";
import { isDefaultCatalogueView, parseCatalogueQuery, queryCatalogue } from "@/lib/courses/course-catalogue";
import { listTranscriptVideoIds } from "@/lib/courses/course-transcript-service";
import { listPublishedVideos, toPublicCourseVideo } from "@/lib/courses/course-video-service";
import { getCoursesCopy, toCoursesLocale } from "@/lib/courses/courses-copy";
import { loadCoursesSidebar } from "@/lib/courses/sidebar/load-courses-sidebar";
import { localizedPath, pageMetadata, serializeJsonLd } from "@/lib/seo";
import { breadcrumbJsonLd, courseListJsonLd } from "@/lib/structured-data";
import "./courses-page.css";

export const dynamic = "force-dynamic";

const SIDEBAR_ID = "courses-aside";

interface CoursesPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: CoursesPageProps) {
  const { locale } = await params;
  const copy = getCoursesCopy(locale);
  return pageMetadata({ title: copy.listTitle, description: copy.listSubtitle, path: "/courses", locale });
}

/** Chapter III · observatory as a page: published course videos, with a reading list from 200lab and ZueyOS. */
export default async function CoursesPage({ params, searchParams }: CoursesPageProps) {
  const { locale } = await params;
  const copy = getCoursesCopy(locale);
  const query = parseCatalogueQuery(await searchParams);
  const db = getDb();
  // The sidebar never rejects (failed sources become fallbacks), so it cannot take the page down.
  const [rows, transcripts, sidebar] = await Promise.all([listPublishedVideos(db), listTranscriptVideoIds(db), loadCoursesSidebar(toCoursesLocale(locale))]);
  const videos = rows.map((row) => toPublicCourseVideo(row, transcripts.has(row.id)));
  const catalogue = queryCatalogue(videos, query);
  const defaultView = isDefaultCatalogueView(query);
  const action = localizedPath("/courses", locale);
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
                <CoursesCatalogueControls action={action} query={query} speakers={catalogue.speakers} copy={copy} filtered={Boolean(query.q || query.speaker) || query.transcript || query.sort !== "newest"} />
                <h2 id="courses-catalogue" className="mono courses-catalogue-head" aria-live="polite">
                  <span>{copy.resultsLabel(catalogue.matched, videos.length)}</span><span className="rule" aria-hidden="true" />
                </h2>
                {catalogue.items.length === 0 ? (
                  <div className="courses-no-results">
                    <p className="courses-no-results-title">{copy.noResultsTitle}</p>
                    <p>{copy.noResultsBody}</p>
                  </div>
                ) : (
                  <ul className="cards courses-cards">
                    {catalogue.items.map((video, i) => {
                      const feature = defaultView && i === 0;
                      return (
                        <li key={video.id} className={feature ? "courses-cards-feature" : undefined}>
                          <CourseVideoCard video={video} locale={locale} index={feature ? 0 : i + 1} />
                        </li>
                      );
                    })}
                  </ul>
                )}
                <CoursesPagination action={action} query={query} page={catalogue.page} pageCount={catalogue.pageCount} copy={copy} />
              </section>
            )}
          </div>
          <CoursesSidebar id={SIDEBAR_ID} data={sidebar} locale={locale} />
        </div>
      </div>
    </main>
  );
}
