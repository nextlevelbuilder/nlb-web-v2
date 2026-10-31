import { getCoursesCopy } from "@/lib/courses/courses-copy";
import type { CoursesSidebarData } from "@/lib/courses/sidebar/load-courses-sidebar";
import { CoursesSidebarLabBlock } from "./courses-sidebar-lab-block";
import { CoursesSidebarMcpBlock } from "./courses-sidebar-mcp-block";
import { CoursesSidebarZueyBlock } from "./courses-sidebar-zuey-block";

/** Right-hand column on /courses: reading transcripts over MCP, then the reading list (stacked below the videos on small screens). */
export function CoursesSidebar({ id, data, locale }: { id: string; data: CoursesSidebarData; locale: string }) {
  const copy = getCoursesCopy(locale);
  return (
    <aside id={id} className="courses-aside" aria-labelledby={`${id}-label`} tabIndex={-1}>
      <p id={`${id}-label`} className="mono courses-aside-label">
        <span className="courses-aside-star" aria-hidden="true">✦</span> {copy.asideLabel}
      </p>
      <CoursesSidebarMcpBlock copy={copy} locale={locale} />
      <CoursesSidebarLabBlock courses={data.labCourses} copy={copy} />
      <CoursesSidebarZueyBlock articles={data.articles} copy={copy} locale={locale} />
    </aside>
  );
}
