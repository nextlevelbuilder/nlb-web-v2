import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import { CourseLockedPanel } from "@/components/courses/course-locked-panel";
import { CourseVideoPlayer } from "@/components/courses/course-video-player";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { canWatchVideo } from "@/lib/courses/course-video-access";
import { courseSlugSchema } from "@/lib/courses/course-video-schemas";
import { getPublishedVideoBySlug } from "@/lib/courses/course-video-service";
import { formatCoursePrice, getCoursesCopy } from "@/lib/courses/courses-copy";
import { localizedPath, pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface CourseVideoPageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadVideo(slug: string) {
  if (!courseSlugSchema.safeParse(slug).success) return null;
  return getPublishedVideoBySlug(slug, getDb());
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

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="wrap w-full max-w-4xl flex-1 pb-20 pt-28">
        <Link
          href={localizedPath("/courses", locale)}
          className="link-arrow mono-label text-ink-2"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          {copy.back}
        </Link>
        <header className="mt-8">
          <div className="mono-label flex flex-wrap items-center gap-4 text-ink-2">
            {video.weekNumber !== null && <span>{copy.week(video.weekNumber)}</span>}
            {video.durationSec > 0 && <span>{copy.minutes(minutes)}</span>}
            <span className="text-primary">{formatCoursePrice(video.priceCents, video.currency, locale)}</span>
          </div>
          <h1 className="h-section mt-4">{video.title}</h1>
        </header>
        <div className="mt-8">
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
        {video.description && (
          <p className="mt-10 max-w-[65ch] whitespace-pre-line text-step-md text-ink-2">{video.description}</p>
        )}
      </main>
      <FooterSection />
    </div>
  );
}
