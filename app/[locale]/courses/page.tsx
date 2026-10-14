import { CourseVideoCard } from "@/components/courses/course-video-card";
import { getDb } from "@/lib/db";
import { listPublishedVideos, toPublicCourseVideo } from "@/lib/courses/course-video-service";
import { getCoursesCopy } from "@/lib/courses/courses-copy";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface CoursesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: CoursesPageProps) {
  const { locale } = await params;
  const copy = getCoursesCopy(locale);
  return pageMetadata({ title: copy.listTitle, description: copy.listSubtitle, path: "/courses", locale });
}

export default async function CoursesPage({ params }: CoursesPageProps) {
  const { locale } = await params;
  const copy = getCoursesCopy(locale);
  const videos = (await listPublishedVideos(getDb())).map(toPublicCourseVideo);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <main id="main" className="wrap flex-1 pb-20 pt-28">
        <header className="max-w-2xl">
          <p className="eyebrow">NLB · {copy.listTitle}</p>
          <h1 className="h-section mt-4">{copy.listTitle}</h1>
          <p className="lede mt-4">{copy.listSubtitle}</p>
        </header>
        {videos.length === 0 ? (
          <p className="surface-panel mt-12 p-6 text-ink-2">{copy.empty}</p>
        ) : (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <li key={video.id}>
                <CourseVideoCard video={video} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
