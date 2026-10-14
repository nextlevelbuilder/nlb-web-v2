'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { scrollToTarget } from '@/lib/constellation/smooth-scroll';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;
const CIRCUMFERENCE = 163.36;

/** Orbit-arc reading progress with the current chapter numeral; click returns to the top. */
export default function OrbitProgress() {
  const t = useTranslations('shell.footer');
  const arc = useRef<SVGCircleElement>(null);
  const planet = useRef<SVGGElement>(null);
  const num = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const chapters = Array.from(document.querySelectorAll<HTMLElement>('#main [data-ch]'));
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      arc.current?.style.setProperty('stroke-dashoffset', String(CIRCUMFERENCE * (1 - p)));
      planet.current?.setAttribute('transform', `rotate(${(p * 360).toFixed(2)})`);
      const mid = window.innerHeight * 0.5;
      let current = 0;
      for (const ch of chapters) if (ch.getBoundingClientRect().top < mid) current = Number(ch.dataset.ch) || 0;
      const label = ROMAN[current] ?? '0';
      if (num.current && num.current.textContent !== label) num.current.textContent = label;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <button className="orbit-progress" id="orbit-progress" type="button" aria-label={t('topAria')} onClick={() => scrollToTarget('top', { duration: 1.6 })}>
      <svg viewBox="-28 -28 56 56" aria-hidden="true">
        <circle className="op-track" r="26" />
        <circle className="op-arc" r="26" transform="rotate(-90)" ref={arc} />
        <g className="op-pg" ref={planet}><circle className="op-planet" cx="0" cy="-26" r="3" /></g>
      </svg>
      <span ref={num} aria-hidden="true">0</span>
    </button>
  );
}
