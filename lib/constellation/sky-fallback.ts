import { CONSTELLATION_ANCHORS, CONSTELLATION_EDGES, CONSTELLATION_MAGNITUDES, CONSTELLATION_WIDTH, seededRandom } from './geometry';

export const FALLBACK_VIEWBOX = '0 0 1600 1000';

/**
 * Static, designed chart shown when WebGL is unavailable (or the context is lost): an engraved field
 * of stars with the NLB constellation at the hero position. Returned as SVG markup built only from
 * numbers, so it is safe to inject.
 */
export function buildSkyFallbackMarkup({ stars = 260, constellation = true } = {}): string {
  const W = 1600;
  const H = 1000;
  const r = seededRandom(7);
  let out = '';
  for (let i = 0; i < stars; i++) {
    out += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(0.6 + Math.pow(r(), 4) * 2).toFixed(2)}" fill="currentColor" opacity="${(0.15 + r() * 0.45).toFixed(2)}"/>`;
  }
  if (!constellation) return out;
  const bw = 500;
  const bh = bw / CONSTELLATION_WIDTH;
  const bx = 1056 - bw / 2;
  const by = 380 - bh / 2;
  const P = (p: readonly [number, number]) => [(bx + (p[0] / CONSTELLATION_WIDTH) * bw).toFixed(1), (by + p[1] * bh).toFixed(1)];
  for (const [a, b] of CONSTELLATION_EDGES) {
    const pa = P(CONSTELLATION_ANCHORS[a]);
    const pb = P(CONSTELLATION_ANCHORS[b]);
    out += `<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="currentColor" stroke-width=".75" opacity=".28"/>`;
  }
  CONSTELLATION_ANCHORS.forEach((p, i) => {
    const c = P(p);
    out += `<circle cx="${c[0]}" cy="${c[1]}" r="${(CONSTELLATION_MAGNITUDES[i] * 0.9).toFixed(1)}" fill="currentColor" opacity=".7"/><circle cx="${c[0]}" cy="${c[1]}" r="${(CONSTELLATION_MAGNITUDES[i] * 2.4).toFixed(1)}" fill="none" stroke="currentColor" stroke-width=".6" opacity=".3"/>`;
  });
  return out;
}
