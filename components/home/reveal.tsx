import type { ReactNode } from 'react';

/**
 * Fade-up on scroll, driven by CSS (`.reveal` in app/globals.css). The content is fully visible in
 * the server HTML, so crawlers, no-JS visitors and full-page captures never see an empty section;
 * browsers with scroll-driven animations add the motion, and reduced-motion visitors get none.
 */
export default function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `reveal ${className}` : 'reveal'}>{children}</div>;
}
