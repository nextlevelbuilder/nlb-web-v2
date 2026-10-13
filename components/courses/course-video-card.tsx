import Link from "next/link";
import { PlayCircle } from "lucide-react";
import type { PublicCourseVideo } from "@/lib/courses/course-video-service";
import { formatCoursePrice, getCoursesCopy } from "@/lib/courses/courses-copy";
import { localizedPath } from "@/lib/seo";

interface CourseVideoCardProps {
  video: PublicCourseVideo;
  locale: string;
}

/** List tile for one published video: week, title, duration and price. */
export function CourseVideoCard({ video, locale }: CourseVideoCardProps) {
  const copy = getCoursesCopy(locale);
  const price = formatCoursePrice(video.priceCents, video.currency, locale);
  const minutes = Math.max(1, Math.round(video.durationSec / 60));
  return (
    <Link
      href={localizedPath(`/courses/${video.slug}`, locale)}
      className="surface-panel group flex h-full flex-col overflow-hidden text-ink transition-colors duration-base hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ring"
    >
      <div className="relative aspect-video w-full border-b border-line bg-canvas-deep">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from Stream/R2 hosts not configured for next/image
          <img src={video.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-3">
            <PlayCircle aria-hidden className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="mono-label flex items-center gap-3 text-ink-3">
          {video.weekNumber !== null && <span>{copy.week(video.weekNumber)}</span>}
          {video.durationSec > 0 && <span>{copy.minutes(minutes)}</span>}
        </div>
        <h2 className="font-display text-step-xl group-hover:text-primary">{video.title}</h2>
        {video.description && <p className="line-clamp-2 text-step-sm text-ink-2">{video.description}</p>}
        <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-step-sm">
          <span className="font-medium text-primary">{price}</span>
          <span className="mono-label inline-flex items-center gap-1 text-ink-2">
            <PlayCircle aria-hidden className="h-3.5 w-3.5" />
            {copy.watch}
          </span>
        </div>
      </div>
    </Link>
  );
}
