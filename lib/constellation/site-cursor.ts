import { gsap } from 'gsap';

const HOVER_TARGETS = 'a, button, summary, [role="button"], .lb-row, .pstar, .card';

type QuickPair = { x: gsap.QuickToFunc; y: gsap.QuickToFunc };

/**
 * Custom ring + dot cursor and magnetic CTAs for fine pointers. Delegated, so it works on every page
 * and on elements rendered after boot. Returns a cleanup; does nothing (and returns a no-op) on touch
 * devices or under reduced motion.
 */
export function initSiteCursor(ring: HTMLElement, dot: HTMLElement): () => void {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduce) return () => {};

  const html = document.documentElement;
  html.classList.add('has-cursor');
  const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'expo.out' });
  const ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'expo.out' });
  const magnets = new WeakMap<HTMLElement, QuickPair>();
  let activeMagnet: HTMLElement | null = null;

  const magnetFor = (el: HTMLElement): QuickPair => {
    let pair = magnets.get(el);
    if (!pair) {
      pair = { x: gsap.quickTo(el, 'x', { duration: 0.6, ease: 'expo.out' }), y: gsap.quickTo(el, 'y', { duration: 0.6, ease: 'expo.out' }) };
      magnets.set(el, pair);
    }
    return pair;
  };
  const release = () => {
    if (!activeMagnet) return;
    const pair = magnetFor(activeMagnet);
    pair.x(0); pair.y(0);
    activeMagnet = null;
  };

  const onMove = (e: PointerEvent) => {
    gsap.set(dot, { x: e.clientX, y: e.clientY });
    rx(e.clientX); ry(e.clientY);
    const magnet = (e.target as Element | null)?.closest?.<HTMLElement>('.magnetic') ?? null;
    if (magnet !== activeMagnet) release();
    if (magnet) {
      activeMagnet = magnet;
      const r = magnet.getBoundingClientRect();
      const pair = magnetFor(magnet);
      pair.x((e.clientX - r.left - r.width / 2) * 0.28);
      pair.y((e.clientY - r.top - r.height / 2) * 0.38);
    }
  };
  const onOver = (e: PointerEvent) => ring.classList.toggle('is-hover', !!(e.target as Element | null)?.closest?.(HOVER_TARGETS));
  const onDown = () => ring.classList.add('is-down');
  const onUp = () => ring.classList.remove('is-down');
  const onLeave = () => { release(); gsap.to([ring, dot], { opacity: 0, duration: 0.3 }); };
  const onEnter = () => gsap.to([ring, dot], { opacity: 1, duration: 0.3 });

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerover', onOver);
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointerup', onUp);
  html.addEventListener('pointerleave', onLeave);
  html.addEventListener('pointerenter', onEnter);

  return () => {
    release();
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerover', onOver);
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointerup', onUp);
    html.removeEventListener('pointerleave', onLeave);
    html.removeEventListener('pointerenter', onEnter);
    html.classList.remove('has-cursor');
    gsap.killTweensOf([ring, dot]);
  };
}
