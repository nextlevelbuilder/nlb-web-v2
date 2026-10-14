import Link from "next/link";
import { getCoursesCopy } from "@/lib/courses/courses-copy";
import { localizedPath } from "@/lib/seo";

/**
 * Shown while no video is published: a dashed orbit plate with a single waiting star, then the two
 * honest ways forward (the VIP plan, or the free reading list in the sidebar). No placeholder videos.
 */
export function CourseEmptyPlate({ locale, resourcesId }: { locale: string; resourcesId: string }) {
  const copy = getCoursesCopy(locale);
  return (
    <section className="courses-empty" aria-labelledby="courses-empty-title">
      <svg className="courses-empty-orbit" viewBox="0 0 320 200" aria-hidden="true">
        <path className="grid-l" d="M0 100H320M160 0V200" />
        <g transform="translate(160 100)">
          <ellipse className="orbit dash" rx="138" ry="46" transform="rotate(-6)" />
          <ellipse className="orbit dash" rx="84" ry="28" transform="rotate(-6)" />
          <circle className="halo" r="20" />
          <path className="spk" d="M-26 0H26M0-26V26" />
          <circle className="core" r="4" />
          <circle className="planet" r="3" cx="-120" cy="35" />
        </g>
      </svg>
      <div className="courses-empty-body">
        <p className="mono courses-kicker">{copy.emptyKicker}</p>
        <h2 id="courses-empty-title" className="courses-empty-title">{copy.emptyTitle}</h2>
        <p className="courses-empty-text">{copy.emptyBody}</p>
        <div className="courses-empty-actions">
          <Link className="btn btn-primary btn-sm" href={`${localizedPath("/", locale)}#pricing`}>{copy.vipButton}</Link>
          <a className="link-arrow" href={`#${resourcesId}`}>{copy.emptyResources} <span aria-hidden="true">↘</span></a>
        </div>
      </div>
    </section>
  );
}
