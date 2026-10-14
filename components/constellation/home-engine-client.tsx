'use client';

import { useLayoutEffect, useRef } from 'react';
import { initHomeEngine } from '@/lib/constellation/home-engine';

/**
 * Mounts the home sky canvas (plus its SVG fallback) and boots the engine against #main once the
 * server-rendered chapters are in the DOM. The returned cleanup reverts pins, tweens, Lenis and GL.
 */
export default function HomeEngineClient() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const root = document.getElementById('main');
    if (!root || !canvas.current || !fallback.current) return;
    try {
      return initHomeEngine({ root, canvas: canvas.current, fallback: fallback.current });
    } catch (error) {
      // The page stays fully readable without the engine (all content is server-rendered and visible).
      console.error('Home experience failed to start:', error);
      return undefined;
    }
  }, []);

  return (
    <>
      <canvas id="sky" ref={canvas} aria-hidden="true" />
      <svg className="sky-fallback" ref={fallback} aria-hidden="true" focusable="false" />
    </>
  );
}
