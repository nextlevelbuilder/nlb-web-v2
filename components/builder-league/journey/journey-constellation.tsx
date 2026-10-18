"use client";

import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { Stage } from "@/lib/builder-league/types";
import { CONSTELLATION_VIEWBOX, type ConstellationStar } from "./constellation-layout";

const subscribeNever = () => () => {};

interface JourneyConstellationProps {
  stars: ConstellationStar[];
  lanes: { stage: Stage; y: number }[];
  laneLabels: Record<Stage, string>;
  label: string;
  hint: string;
}

/**
 * Interactive star chart of the journey. It is an enhancement: it mounts only after hydration (the
 * server-rendered timeline is the no-JS view), is fully keyboard navigable with a roving tab stop,
 * and fades in only when the visitor allows motion.
 */
export default function JourneyConstellation({ stars, lanes, laneLabels, label, hint }: JourneyConstellationProps) {
  // False during SSR and hydration, true afterwards: the chart never renders into the server HTML.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [active, setActive] = useState(0);
  const refs = useRef<(SVGGElement | null)[]>([]);

  if (!mounted || stars.length === 0) return null;

  const focusStar = (index: number) => {
    const next = Math.max(0, Math.min(stars.length - 1, index));
    setActive(next);
    refs.current[next]?.focus();
  };

  const openStep = (id: string) => {
    const target = document.getElementById(`step-${id}`);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    target.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => focusStar(index + 1),
      ArrowDown: () => focusStar(index + 1),
      ArrowLeft: () => focusStar(index - 1),
      ArrowUp: () => focusStar(index - 1),
      Home: () => focusStar(0),
      End: () => focusStar(stars.length - 1),
      Enter: () => openStep(stars[index].id),
      " ": () => openStep(stars[index].id),
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  };

  const path = stars.map((star, i) => `${i === 0 ? "M" : "L"}${star.x.toFixed(1)},${star.y.toFixed(1)}`).join(" ");

  return (
    <figure className="surface-panel overflow-hidden p-3 sm:p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
      <svg
        viewBox={`0 0 ${CONSTELLATION_VIEWBOX.width} ${CONSTELLATION_VIEWBOX.height}`}
        role="group"
        aria-label={label}
        className="h-auto w-full text-ink"
      >
        {lanes.map((lane) => (
          <g key={lane.stage} aria-hidden>
            <line x1={40} x2={CONSTELLATION_VIEWBOX.width - 40} y1={lane.y} y2={lane.y} className="stroke-line" strokeDasharray="2 6" />
            <text x={40} y={lane.y - 12} className="fill-ink-3 font-mono text-[13px] uppercase tracking-[0.2em]">{laneLabels[lane.stage]}</text>
          </g>
        ))}
        <path d={path} fill="none" className="stroke-ink-3" strokeWidth={1} aria-hidden />
        {stars.map((star, index) => (
          <g
            key={star.id}
            ref={(node) => { refs.current[index] = node; }}
            role="link"
            tabIndex={index === active ? 0 : -1}
            aria-label={star.label}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => { setActive(index); openStep(star.id); }}
            onFocus={() => setActive(index)}
            className="group cursor-pointer outline-none"
          >
            <circle cx={star.x} cy={star.y} r={18} fill="transparent" />
            <circle cx={star.x} cy={star.y} r={star.r + 6} className="fill-none stroke-primary opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-100" strokeWidth={1.5} />
            <circle cx={star.x} cy={star.y} r={star.r} className={star.learning ? "fill-background stroke-primary" : "fill-primary"} strokeWidth={star.learning ? 2 : 0} />
            <title>{star.label}</title>
          </g>
        ))}
      </svg>
      <figcaption className="mt-3 font-mono text-step-xs text-ink-3">{hint}</figcaption>
    </figure>
  );
}
