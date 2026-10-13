'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  phase: number;
  speed: number;
}

const MAX_DPR = 2;

function readStarColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--star-rgb').trim();
  return value ? value.split(/\s+/).join(',') : '255,246,228';
}

function makeStars(width: number, height: number): Star[] {
  // Density scales with area; small screens get fewer stars.
  const count = Math.min(220, Math.round((width * height) / 5200));
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() < 0.08 ? 1.4 + Math.random() * 0.8 : 0.4 + Math.random() * 0.8,
    base: 0.25 + Math.random() * 0.6,
    phase: Math.random() * Math.PI * 2,
    speed: 0.4 + Math.random() * 0.9,
  }));
}

/**
 * Decorative Canvas2D starfield behind the hero. DPR capped at 2, the rAF loop pauses when the canvas
 * is offscreen or the tab is hidden, the palette follows the theme, and visitors who prefer reduced
 * motion get a single static frame.
 */
export default function StarField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let stars: Star[] = [];
    let color = readStarColor();
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const still = reduceMotion.matches;
      for (const star of stars) {
        const alpha = still ? star.base : star.base * (0.6 + 0.4 * Math.sin(star.phase + (time / 1000) * star.speed));
        ctx.fillStyle = `rgba(${color},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const start = () => {
      stop();
      if (reduceMotion.matches || !visible || document.hidden) {
        draw(0);
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = makeStars(width, height);
      start();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    intersection.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      color = readStarColor();
      if (!frame) draw(0);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', start);
    reduceMotion.addEventListener('change', start);

    return () => {
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', start);
      reduceMotion.removeEventListener('change', start);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />;
}
