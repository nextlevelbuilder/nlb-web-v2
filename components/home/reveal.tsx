'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Fade-up when a section scrolls into view. The server HTML is fully visible, so crawlers, no-JS
 * visitors and tall-viewport renderers always see the content. After hydration, only an element
 * that is still below the viewport is marked `pending` (hidden, see `.reveal` in app/globals.css)
 * and is revealed once it intersects, so nothing visible ever blinks out.
 */
export default function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    element.dataset.reveal = 'pending';
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        element.dataset.reveal = 'shown';
        observer.disconnect();
      },
      { rootMargin: '0px 0px -10% 0px' }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      element.dataset.reveal = 'shown';
    };
  }, []);

  return (
    <div ref={ref} className={className ? `reveal ${className}` : 'reveal'}>
      {children}
    </div>
  );
}
