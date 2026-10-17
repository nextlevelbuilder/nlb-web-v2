import type { ReactNode } from "react";
import { withSidebarUtm } from "@/lib/courses/sidebar/utm-link";

interface CourseOutboundLinkProps {
  href: string;
  /** Localized "(opens in a new tab)" hint, read by screen readers only. */
  newTabLabel: string;
  className?: string;
  children: ReactNode;
}

/** External link from the /courses sidebar: UTM-tagged, new tab, no opener or referrer leak. */
export function CourseOutboundLink({ href, newTabLabel, className, children }: CourseOutboundLinkProps) {
  return (
    <a href={withSidebarUtm(href)} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> {newTabLabel}</span>
    </a>
  );
}
