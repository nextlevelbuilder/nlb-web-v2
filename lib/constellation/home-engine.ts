import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { formatCelestialCoord } from './celestial-coords';
import { initChapterMotion } from './chapter-motion';
import { createSceneState, REDUCED_MOTION_STATES, type SceneState } from './scene-state';
import { buildSkyFallbackMarkup, FALLBACK_VIEWBOX } from './sky-fallback';
import { createSky, type SkyHandle } from './sky-renderer';
import { scrollToTarget, setLenis } from './smooth-scroll';

export interface HomeEngineElements {
  /** <main> holding the chapters. */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  fallback: SVGSVGElement;
}

/**
 * Boots the home experience: WebGL sky, Lenis smooth scroll, GSAP chapter choreography, live cursor
 * coordinates and in-page anchors. Under reduced motion there is no smooth scroll or animation: the
 * sky changes state per chapter and all content stays static. Returns a cleanup that undoes everything.
 */
export function initHomeEngine({ root, canvas, fallback }: HomeEngineElements): () => void {
  const html = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const S: SceneState = createSceneState(reduce);
  const cleanups: Array<() => void> = [];
  let sky: SkyHandle | null = null;
  let disposed = false;

  const showFallback = () => {
    html.classList.add('no-webgl');
    if (!fallback.childNodes.length) {
      fallback.setAttribute('viewBox', FALLBACK_VIEWBOX);
      fallback.innerHTML = buildSkyFallbackMarkup();
    }
  };
  cleanups.push(() => html.classList.remove('no-webgl'));

  /* ---- sky: started after first paint so the headline stays the LCP element ---- */
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  const startRaf = requestAnimationFrame(() => {
    startTimer = setTimeout(() => {
      if (disposed) return;
      const constellationBox = root.querySelector<HTMLElement>('#const-box');
      const igniteAnchor = root.querySelector<HTMLElement>('#ignite');
      if (!constellationBox || !igniteAnchor) { showFallback(); return; }
      sky = createSky({ canvas, state: S, constellationBox, igniteAnchor, reducedMotion: reduce, finePointer: fine, onFallback: showFallback });
      sky?.start();
    }, 60);
  });
  cleanups.push(() => { cancelAnimationFrame(startRaf); clearTimeout(startTimer); sky?.destroy(); sky = null; });

  /* ---- theme crossfade follows <html data-theme> (next-themes) ---- */
  const themeObserver = new MutationObserver(() => sky?.setTheme(html.getAttribute('data-theme') === 'light'));
  themeObserver.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  cleanups.push(() => themeObserver.disconnect());

  /* ---- pointer → sky gravity + celestial coordinates ---- */
  const coordEl = root.querySelector<HTMLElement>('#cursor-coord');
  if (fine && !reduce) {
    let coordRaf = 0;
    const onMove = (e: PointerEvent) => {
      S.mx = e.clientX; S.my = e.clientY; S.mOn = true;
      if (!coordRaf && coordEl) {
        coordRaf = requestAnimationFrame(() => { coordRaf = 0; coordEl.textContent = formatCelestialCoord(S.mx, S.my, window.innerWidth, window.innerHeight); });
      }
    };
    const onLeave = () => { S.mOn = false; };
    window.addEventListener('pointermove', onMove, { passive: true });
    html.addEventListener('pointerleave', onLeave);
    cleanups.push(() => { window.removeEventListener('pointermove', onMove); html.removeEventListener('pointerleave', onLeave); cancelAnimationFrame(coordRaf); });
  }

  /* ---- in-page anchors scroll through Lenis (or natively) ---- */
  const onAnchorClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as Element | null)?.closest?.('a[href^="#"]');
    const id = link?.getAttribute('href');
    if (!id || id.length < 2) return;
    const target = document.getElementById(decodeURIComponent(id.slice(1)));
    if (!target) return;
    e.preventDefault();
    scrollToTarget(target);
    if (target.id === 'main') target.focus({ preventScroll: true });
  };
  document.addEventListener('click', onAnchorClick);
  cleanups.push(() => document.removeEventListener('click', onAnchorClick));

  if (!reduce) {
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
    const onScroll = () => ScrollTrigger.update();
    const tick = (time: number) => lenis.raf(time * 1000);
    lenis.on('scroll', onScroll);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    setLenis(lenis);
    const stopMotion = initChapterMotion(root, S);
    cleanups.push(() => {
      stopMotion();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      setLenis(null);
    });

    // Arriving at /#pricing: pin spacers moved the target after the browser's own jump.
    const hashTarget = window.location.hash.length > 1 ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
    if (hashTarget) {
      ScrollTrigger.refresh();
      lenis.scrollTo(hashTarget, { offset: -8, immediate: true, force: true });
    }
  } else {
    // Reduced motion: the orbit illustrations' SMIL loops are not covered by the CSS kill switch.
    const smil = Array.from(root.querySelectorAll<SVGSVGElement>('svg'));
    smil.forEach((svg) => { svg.pauseAnimations(); svg.setCurrentTime(0); });
    cleanups.push(() => smil.forEach((svg) => svg.unpauseAnimations()));
  }

  if (reduce && 'IntersectionObserver' in window) {
    // Reduced motion: the sky changes state per chapter, instantly, with no animation.
    let current = -1;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const ch = Number(entry.target.getAttribute('data-ch'));
        if (ch !== current && REDUCED_MOTION_STATES[ch]) {
          current = ch;
          Object.assign(S, REDUCED_MOTION_STATES[ch]);
          sky?.redraw();
        }
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    root.querySelectorAll('[data-ch]').forEach((el) => io.observe(el));
    // the constellation sits in an in-flow slot: keep it aligned while scrolling (no animation)
    let rq = 0;
    const onScroll = () => {
      if (current !== 2 || rq) return;
      rq = requestAnimationFrame(() => { rq = 0; sky?.redraw(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    cleanups.push(() => { io.disconnect(); window.removeEventListener('scroll', onScroll); cancelAnimationFrame(rq); });
  }

  return () => {
    disposed = true;
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try {
        cleanups[i]();
      } catch (error) {
        console.error('[constellation] cleanup failed:', error);
      }
    }
  };
}
