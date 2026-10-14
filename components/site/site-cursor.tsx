'use client';

import { useEffect, useRef } from 'react';
import { initSiteCursor } from '@/lib/constellation/site-cursor';

/** Ring + dot cursor and magnetic CTAs (fine pointers, motion allowed). Hidden by CSS otherwise. */
export default function SiteCursor() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ring.current || !dot.current) return;
    return initSiteCursor(ring.current, dot.current);
  }, []);

  return (
    <>
      <div ref={ring} className="cursor cursor-ring" aria-hidden="true" />
      <div ref={dot} className="cursor cursor-dot" aria-hidden="true" />
    </>
  );
}
