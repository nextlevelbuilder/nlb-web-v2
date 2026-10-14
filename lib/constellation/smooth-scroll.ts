import type Lenis from 'lenis';

/**
 * Registry for the page's Lenis instance (home only). Site chrome (header menu, orbit progress,
 * sticky CTA) scrolls through it when present and falls back to native scrolling otherwise.
 */
let current: Lenis | null = null;

export function setLenis(instance: Lenis | null): void {
  current = instance;
}

export function getLenis(): Lenis | null {
  return current;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Scroll to an in-page element (or the top). Returns false when the target does not exist. */
export function scrollToTarget(target: HTMLElement | 'top', { offset = -8, duration = 1.4 } = {}): boolean {
  if (current) {
    // force: a menu link may fire while the menu still holds the scroll lock.
    if (target === 'top') current.scrollTo(0, { duration: 1.6, force: true });
    else current.scrollTo(target, { offset: target.id === 'hook' ? 0 : offset, duration, force: true });
    return true;
  }
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  if (target === 'top') window.scrollTo({ top: 0, behavior });
  else target.scrollIntoView({ behavior, block: 'start' });
  return true;
}

/** Stop/start smooth scrolling while an overlay (mobile menu) is open. */
export function lockScroll(locked: boolean): void {
  if (current) {
    if (locked) current.stop();
    else current.start();
  }
  document.body.style.overflow = locked ? 'hidden' : '';
}
