/**
 * Sky-map geometry for the Directory chapter: today's top products drawn as one constellation.
 * Stars march left to right in rank order (α → ε) and are joined by constellation lines; each
 * star's height and nudge come from its slug, so a product keeps its place in the sky between
 * visits. Brightness and size follow Trust, the glow follows votes. Exact numbers live in the
 * board next to the chart. Pure so the layout is unit-tested; the SVG is rendered on the server.
 */
import { seededRandom } from './geometry';

export interface PlotInput {
  slug: string;
  trust: number;
  votes: number;
}

export interface PlotStar {
  x: number;
  y: number;
  r: number;
  haloR: number;
  opacity: number;
  /** 0..1 apparent magnitude, also used for the board row's star and bar. */
  magnitude: number;
  labelX: number;
  /** Baseline of the name label, moved off its star when another label would overlap it. */
  labelY: number;
  labelAnchor: 'start' | 'end';
  greekX: number;
  greekY: number;
}

export interface PlotGeometry {
  width: number;
  height: number;
  /** Faint graticule (sky-map grid) positions, drawn without numbers. */
  gridX: number[];
  gridY: number[];
  stars: PlotStar[];
  chain: string;
}

const W = 520;
const H = 380;
/** Star field: leaves room for labels on the right and the caption above. */
const X0 = 70;
const X1 = 400;
const Y0 = 56;
const Y1 = 324;
/** Smallest vertical step between neighbours, so the chain never collapses into a flat line. */
const MIN_RISE = 38;

/** Name labels are 15px serif; one line plus breathing room. */
const LABEL_LINE = 17;
/** Generous label width estimate, so labels on the same side count as overlapping. */
const LABEL_WIDTH = 170;

const finite = (n: number) => (Number.isFinite(n) ? n : 0);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** FNV-1a, mapped into the generator's valid seed range (1 … 2^31 − 2). */
function slugSeed(slug: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 2147483646) + 1;
}

type LabelBox = { x: number; y: number; anchor: 'start' | 'end' };

function labelsOverlap(a: LabelBox, b: LabelBox): boolean {
  const span = (box: LabelBox) => (box.anchor === 'start' ? [box.x, box.x + LABEL_WIDTH] : [box.x - LABEL_WIDTH, box.x]);
  const [a0, a1] = span(a);
  const [b0, b1] = span(b);
  return a0 < b1 && b0 < a1 && Math.abs(a.y - b.y) < LABEL_LINE;
}

/** Labels sit just above their star; one that would overlap another moves up a line, or below near the top. */
function placeLabels(stars: Array<{ y: number; labelX: number; labelAnchor: 'start' | 'end' }>): number[] {
  const order = stars.map((_, i) => i).sort((a, b) => stars[b].y - stars[a].y || b - a);
  const placed: LabelBox[] = [];
  const result = new Array<number>(stars.length);
  for (const i of order) {
    const star = stars[i];
    const box: LabelBox = { x: star.labelX, y: star.y - 12, anchor: star.labelAnchor };
    while (placed.some((other) => labelsOverlap(box, other)) && box.y - LABEL_LINE >= Y0 - 20) box.y -= LABEL_LINE;
    if (placed.some((other) => labelsOverlap(box, other))) {
      box.y = star.y + 22;
      while (placed.some((other) => labelsOverlap(box, other))) box.y += LABEL_LINE;
    }
    placed.push(box);
    result[i] = box.y;
  }
  return result;
}

export function computeDirectoryPlot(entries: PlotInput[]): PlotGeometry {
  const trusts = entries.map((e) => clamp(finite(e.trust), 0, 100));
  const votes = entries.map((e) => Math.max(0, finite(e.votes)));
  const n = entries.length;
  const step = n > 1 ? (X1 - X0) / (n - 1) : 0;
  const maxVotes = Math.max(1, ...votes);

  // Magnitude spreads today's Trust range across the visible scale, never below a faint floor.
  const tMax = n ? Math.max(...trusts) : 100;
  const tMin = n ? Math.min(...trusts) : 0;
  const floor = Math.min(tMin, tMax - 20);

  let prevY = 0;
  const stars = entries.map((entry, i): PlotStar => {
    const rand = seededRandom(slugSeed(entry.slug || String(i)));
    // A single star sits mid-field; otherwise march left to right with a slug-stable nudge.
    const x = n > 1 ? X0 + i * step + (rand() - 0.5) * step * 0.3 : (X0 + X1) / 2;
    let y: number;
    if (i === 0) {
      y = Y0 + 20 + rand() * (Y1 - Y0) * 0.3; // the leader shines near the top
    } else {
      const rise = (rand() - 0.45) * 2 * 110;
      y = clamp(prevY + rise, Y0, Y1);
      if (Math.abs(y - prevY) < MIN_RISE) y = prevY + (prevY + MIN_RISE <= Y1 ? MIN_RISE : -MIN_RISE);
    }
    prevY = y;

    const magnitude = clamp((trusts[i] - floor) / Math.max(tMax - floor, 1), 0.12, 1);
    const r = 2.2 + magnitude * 4.2;
    const glow = 1 + (votes[i] / maxVotes) * 0.6;
    const rightEdge = x > X1 - 60;
    return {
      x, y, r, haloR: r * 3.2 * glow, opacity: 0.45 + magnitude * 0.55, magnitude,
      labelX: rightEdge ? x - 14 : x + 14, labelY: y - 12, labelAnchor: rightEdge ? 'end' : 'start',
      greekX: x + r * 3.4 + 4, greekY: y + 6,
    };
  });
  const labelYs = placeLabels(stars);
  stars.forEach((star, i) => { star.labelY = labelYs[i]; });

  return {
    width: W, height: H,
    gridX: [1, 2, 3, 4].map((k) => (W / 5) * k),
    gridY: [1, 2, 3].map((k) => (H / 4) * k),
    stars,
    chain: stars.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(' '),
  };
}
