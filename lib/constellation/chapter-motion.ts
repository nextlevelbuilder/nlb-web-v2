import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { SceneState } from './scene-state';
import { lineIndexOf, linesOf, splitWordsOf } from './split-lines';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** A chapter is pinned only when it fits the viewport (small phones scroll it instead). */
/**
 * Pin only chapters that fit the viewport. The design's check (+4px) passed in the prototype because it
 * measured before web fonts arrived; with fonts preloaded the community chapter measures a few pixels
 * taller at 1440×900. Up to 24px of overflow falls inside the chapter's ≥88px bottom padding, so
 * pinning still hides nothing.
 */
const PIN_TOLERANCE_PX = 24;
const canPin = (el: HTMLElement) => el.offsetHeight <= window.innerHeight + PIN_TOLERANCE_PX;

/**
 * Scroll choreography for the home narrative, ported from the Constellation mockup: pinned hook,
 * dark and community chapters drive the sky; headings rise line by line; plates, cards, the sky
 * chart, counters, seat rings and the terminal reveal once. Everything is created inside one
 * gsap.context so a single revert() removes pins, triggers and inline styles.
 */
export function initChapterMotion(root: HTMLElement, S: SceneState): () => void {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const lines = new Map<Element, HTMLElement[][]>();
  const regroup = () => root.querySelectorAll('[data-split]').forEach((el) => lines.set(el, linesOf(el)));
  const lineStagger = (el: Element) => (_i: number, target: Element) => lineIndexOf(lines.get(el) ?? [], target) * 0.1;
  regroup();

  const countRestore: Array<[HTMLElement, string]> = [];
  const darkWords = Array.from(root.querySelectorAll<HTMLElement>('#dark-title .fw'));
  const listeners: Array<() => void> = [];
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | null, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
    if (!el) return;
    el.addEventListener(type, fn);
    listeners.push(() => el.removeEventListener(type, fn));
  };

  const ctx = gsap.context(() => {
    const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const qa = <T extends Element = HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

    /* 0 · first light: the hero point ignites (the copy rises with CSS so it is in the server HTML) */
    gsap.to(S, { intro: 1, duration: 2.2, ease: 'expo.out', delay: 0.2 });

    /* 0 · hook pin: copy lifts away, instrument opens, the point splits */
    const hook = q('#hook');
    if (hook) {
      gsap.timeline({ scrollTrigger: { trigger: hook, start: 'top top', end: '+=100%', pin: canPin(hook), scrub: 0.8, onUpdate: (s) => { S.split = s.progress; } } })
        .to('.hook-copy', { y: -70, opacity: 0, ease: 'power2.in' }, 0)
        .to('.planisphere svg', { scale: 1.6, opacity: 0, rotation: 40, ease: 'none' }, 0)
        .to('.hook-meta, .scroll-cue', { opacity: 0, ease: 'none', duration: 0.4 }, 0);
    }

    /* I · the dark: words light up one by one */
    const dark = q('#dark');
    if (dark) {
      const darkP = { v: 0 };
      const paint = () => {
        const n = darkWords.length;
        darkWords.forEach((w, i) => { w.style.opacity = String(0.13 + 0.87 * clamp(darkP.v * (n + 3) - i, 0, 1)); });
      };
      gsap.timeline({ scrollTrigger: { trigger: dark, start: 'top top', end: '+=120%', pin: canPin(dark), scrub: 0.6, onUpdate: (s) => { S.dark = s.progress; } } })
        .to(darkP, { v: 1, ease: 'none', duration: 1, onUpdate: paint })
        .from('#dark .caption', { opacity: 0, y: 14, ease: 'none', duration: 0.3 }, '-=.3');
      paint();
    }

    /* II · constellation: particles snap into NLB */
    const comm = q('#community');
    if (comm) {
      const commPin = canPin(comm);
      if (commPin) {
        ScrollTrigger.create({ trigger: comm, start: 'top 70%', end: 'top top', onUpdate: (s) => { S.pre = s.progress; S.form = S.pre * 0.35 + S.formPin * 0.65; } });
      }
      // pinned: snap while held in place · too tall to pin: snap as the slot crosses the upper viewport
      gsap.timeline({
        scrollTrigger: commPin
          ? { trigger: comm, start: 'top top', end: '+=130%', pin: true, scrub: 0.6, onUpdate: (s) => { S.formPin = clamp(s.progress / 0.7, 0, 1); S.form = S.pre * 0.35 + S.formPin * 0.65; } }
          : { trigger: '#const-box', start: 'top 85%', end: 'top 15%', scrub: 0.6, onUpdate: (s) => { S.form = s.progress; } },
      })
        .from('.const-label', { opacity: 0, y: 10, duration: 0.3 }, 0.35)
        .from('.feats-c .fc', { opacity: 0, y: 22, stagger: 0.1, duration: 0.3 }, 0.25)
        .to({}, { duration: 0.3 });
    }

    /* courses enter: the constellation dissolves into a quiet field */
    if (q('#courses')) ScrollTrigger.create({ trigger: '#courses', start: 'top bottom', end: 'top 25%', scrub: true, onUpdate: (s) => { S.settle = s.progress; } });
    /* finale: every star gathers into one */
    if (q('#finale')) ScrollTrigger.create({ trigger: '#finale', start: 'top 85%', end: 'center center', scrub: true, onUpdate: (s) => { S.gather = s.progress; } });

    /* headings: masked line rise (once) */
    qa('[data-split="rise"]').forEach((el) => {
      if (el.id === 'hook-title') return;
      const words = splitWordsOf(el);
      gsap.set(words, { yPercent: 115 });
      ScrollTrigger.create({
        trigger: el, start: 'top 85%', once: true,
        onEnter: () => { gsap.to(words, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: lineStagger(el) }); },
      });
    });

    /* plate rules draw */
    qa('.plate .rule').forEach((r) => gsap.from(r, { scaleX: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: r, start: 'top 90%', once: true } }));

    /* courses: lenses focus in */
    if (q('.cards')) {
      gsap.from('.card', { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.cards', start: 'top 82%', once: true } });
      gsap.from('.lens svg', { scale: 1.12, duration: 1.6, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.cards', start: 'top 82%', once: true } });
    }

    /* directory: stars pop in by rank, chain draws, rows settle */
    if (q('.dir-grid')) {
      const chain = q<SVGPolylineElement>('#plot .chain');
      const dirTl = gsap.timeline({ scrollTrigger: { trigger: '.dir-grid', start: 'top 78%', once: true } });
      if (qa('.pstar').length) dirTl.from('.pstar', { opacity: 0, scale: 0.2, transformOrigin: 'center', duration: 0.9, ease: 'expo.out', stagger: 0.12 }, 0);
      if (chain && typeof chain.getTotalLength === 'function') {
        const length = chain.getTotalLength();
        if (length > 0) {
          gsap.set(chain, { strokeDasharray: length, strokeDashoffset: length });
          dirTl.to(chain, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' }, 0.2);
        }
      }
      dirTl.from('.lb-row', { x: -16, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.07 }, 0.1);
      if (qa('.mag-bar i').length) dirTl.from('.mag-bar i', { scaleX: 0, duration: 1.2, ease: 'expo.out', stagger: 0.07 }, 0.3);
    }

    /* proof: numbers count up */
    qa('[data-count]').forEach((el) => {
      const original = el.textContent ?? '';
      countRestore.push([el, original]);
      const target = Number(el.getAttribute('data-count'));
      if (!Number.isFinite(target)) return;
      const pre = el.getAttribute('data-prefix') ?? '';
      const suf = el.getAttribute('data-suffix') ?? '';
      const o = { v: 0 };
      el.textContent = `${pre}0${suf}`;
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: () => { gsap.to(o, { v: target, duration: 1.8, ease: 'expo.out', onUpdate: () => { el.textContent = `${pre}${Math.round(o.v)}${suf}`; } }); },
      });
    });
    if (q('.quotes')) gsap.from('.quote', { y: 30, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.12, scrollTrigger: { trigger: '.quotes', start: 'top 85%', once: true } });

    /* founders, partners, member launches, team fleet, FAQ: the same once-only rise */
    ([['.founders-grid', '.founder'], ['.alliance', '.ally'], ['.launches', '.launch'], ['.fleet', '.fleet li'], ['.faq-list', '.faq-item'], ['.logbook', '.log-entry']] as const)
      .forEach(([group, items]) => {
        if (q(group) && qa(items).length) gsap.from(items, { y: 30, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: group, start: 'top 85%', once: true } });
      });

    /* pricing: stars ignite, seat rings fill */
    if (q('.plans')) {
      qa<SVGCircleElement>('.ring-fill').forEach((r) => {
        const taken = Number(r.getAttribute('data-taken'));
        gsap.fromTo(r, { strokeDashoffset: 289.03 }, { strokeDashoffset: 289.03 * (1 - (Number.isFinite(taken) ? taken : 0)), duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: '.plans', start: 'top 80%', once: true } });
      });
      gsap.from('.plan-star .pcore, .plan-star .phalo', { scale: 0, transformOrigin: 'center', duration: 1.4, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.plans', start: 'top 80%', once: true } });
      if (qa('.meter i').length) gsap.from('.meter i', { scaleX: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.plans', start: 'top 80%', once: true } });
      gsap.from('.plan', { y: 36, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.12, scrollTrigger: { trigger: '.plans', start: 'top 85%', once: true } });
    }

    /* terminal: lines transmit in sequence */
    if (q('.term')) gsap.from('#cli-code .ln', { clipPath: 'inset(0 100% 0 0)', duration: 0.9, ease: 'power2.out', stagger: 0.18, scrollTrigger: { trigger: '.term', start: 'top 80%', once: true } });

    /* finale: hover or focus ignites the gathered star */
    const finaleCta = q('#finale-cta');
    const igniteOn = () => { S.igniteT = 1; };
    const igniteOff = () => { S.igniteT = 0; };
    on(finaleCta, 'pointerenter', igniteOn);
    on(finaleCta, 'pointerleave', igniteOff);
    on(finaleCta, 'focus', igniteOn);
    on(finaleCta, 'blur', igniteOff);
  }, root);

  /* fonts change line breaks: regroup lines and refresh measurements */
  let alive = true;
  document.fonts?.ready.then(() => {
    if (!alive) return;
    regroup();
    ScrollTrigger.refresh();
  }).catch(() => { /* font loading failures keep the fallback metrics */ });

  return () => {
    alive = false;
    listeners.forEach((off) => off());
    ctx.revert();
    darkWords.forEach((w) => { w.style.opacity = ''; });
    countRestore.forEach(([el, text]) => { el.textContent = text; });
  };
}
