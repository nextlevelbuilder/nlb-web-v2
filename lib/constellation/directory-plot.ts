/**
 * Star-magnitude chart geometry for the Directory chapter: Trust on the y axis, votes on the x axis,
 * brighter (larger) stars for higher Trust. Pure so the scales are unit-tested; the SVG is rendered
 * on the server from this description.
 */
export interface PlotInput {
  trust: number;
  votes: number;
}

export interface PlotTick {
  value: number;
  pos: number;
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
  labelAnchor: 'start' | 'end';
  greekX: number;
}

export interface PlotGeometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  trustTicks: PlotTick[];
  voteTicks: PlotTick[];
  stars: PlotStar[];
  chain: string;
}

const W = 520;
const H = 380;
const L = 44;
const R = 500;
const T = 26;
const B = 340;

/** A 1-2-5 step (votes are whole numbers, so never 2.5 and never below 1). */
function niceStep(range: number, count: number): number {
  const raw = range / Math.max(count, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / pow;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return Math.max(1, nice * pow);
}

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

export function computeDirectoryPlot(entries: PlotInput[]): PlotGeometry {
  const trusts = entries.map((e) => Math.min(100, Math.max(0, finite(e.trust))));
  const votes = entries.map((e) => Math.max(0, finite(e.votes)));

  // Trust axis: a 5-tick band around the data, never wider than 0..100.
  const tMax = trusts.length ? Math.max(...trusts) : 100;
  const tMin = trusts.length ? Math.min(...trusts) : 80;
  const tStep = Math.max(1, Math.ceil(Math.max(tMax - tMin + 4, 8) / 4));
  const yTop = Math.min(100, Math.ceil((tMax + tStep / 2) / tStep) * tStep);
  const yBottom = Math.max(0, yTop - tStep * 4);
  const yHi = yTop + tStep * 0.2;
  const Y = (t: number) => T + ((yHi - t) / (yHi - yBottom)) * (B - T);

  // Votes axis: from a little below zero so a zero-vote star is not glued to the axis.
  const vMax = votes.length ? Math.max(...votes) : 0;
  const vStep = niceStep(Math.max(vMax * 1.15, 10), 4);
  const xHi = Math.max(vStep * 4, vMax * 1.08);
  const xLo = -xHi * 0.06;
  const X = (v: number) => L + ((v - xLo) / (xHi - xLo)) * (R - L);

  const trustTicks: PlotTick[] = [0, 1, 2, 3, 4].map((i) => ({ value: yTop - i * tStep, pos: Y(yTop - i * tStep) }));
  const voteTicks: PlotTick[] = [1, 2, 3, 4].map((i) => ({ value: i * vStep, pos: X(i * vStep) })).filter((tick) => tick.pos <= R);

  const span = Math.max(yTop - yBottom, 1);
  const stars = entries.map((_, i): PlotStar => {
    const x = X(votes[i]);
    const y = Y(trusts[i]);
    const magnitude = Math.min(1, Math.max(0.12, (trusts[i] - yBottom) / span));
    const r = 2.2 + magnitude * 4.2;
    const leftSide = x > (L + R) / 2;
    return {
      x, y, r, haloR: r * 3.2, opacity: 0.45 + magnitude * 0.55, magnitude,
      labelX: leftSide ? x - 12 : x + 12, labelAnchor: leftSide ? 'end' : 'start', greekX: x + r * 3.4 + 4,
    };
  });

  return {
    width: W, height: H, left: L, right: R, top: T, bottom: B, trustTicks, voteTicks, stars,
    chain: stars.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(' '),
  };
}
