import Link from "next/link";
import { LENS_COORDS, LENSES } from "@/components/constellation/course-lenses";
import type { PublicCourseVideo } from "@/lib/courses/course-video-service";
import { formatCoursePrice, getCoursesCopy } from "@/lib/courses/courses-copy";
import { localizedPath } from "@/lib/seo";

interface CourseVideoCardProps {
  video: PublicCourseVideo;
  locale: string;
  /** Position in the list: picks the lens illustration and marks the first card as the feature. */
  index?: number;
}

/**
 * Constellation lens card for one published video: week, minutes, price, title, description and a
 * "View video" link whose hit area covers the whole card.
 */
export function CourseVideoCard({ video, locale, index = 0 }: CourseVideoCardProps) {
  const copy = getCoursesCopy(locale);
  const price = video.priceCents > 0 ? formatCoursePrice(video.priceCents, video.currency, locale) : null;
  const minutes = Math.max(1, Math.round(video.durationSec / 60));
  const Lens = LENSES[index % LENSES.length];
  const titleId = `course-video-${video.id}`;

  return (
    <article className={index === 0 ? "card feature courses-card" : "card courses-card"} aria-labelledby={titleId}>
      <div className="lens">
        <div className="lens-meta mono">
          <span>{video.weekNumber !== null ? `${copy.observation(video.weekNumber)} · ` : ""}{LENS_COORDS[index % LENS_COORDS.length]}</span>
          {price && <span className="badge">{price}</span>}
        </div>
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from Stream/R2 hosts not configured for next/image
          <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <Lens still />
        )}
      </div>
      <div className="card-body">
        <p className="card-meta mono">
          {video.weekNumber !== null && <><span>{copy.week(video.weekNumber)}</span><span aria-hidden="true">·</span></>}
          <span>{copy.minutes(minutes)}</span>
          {video.hasTranscript && <><span aria-hidden="true">·</span><span className="courses-card-transcript">{copy.transcriptBadge}</span></>}
        </p>
        <h3 id={titleId}>{video.title}</h3>
        {video.description && <p className="card-desc courses-card-desc">{video.description}</p>}
        <div className="card-foot">
          <small className="courses-card-price">{price ?? ""}</small>
          <Link className="btn btn-ghost btn-sm courses-card-link" href={localizedPath(`/courses/${video.slug}`, locale)}>
            {copy.watch}<span className="sr-only">: {video.title}</span> <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
