/**
 * "NLB" constellation geometry, shared by the WebGL sky and its SVG fallback.
 * Unit box is CONSTELLATION_WIDTH × 1 (y down); vertices are the anchor stars.
 */
export type Point = readonly [number, number];

export const CONSTELLATION_ANCHORS: readonly Point[] = [
  [0, 1], [0.03, 0], [0.67, 0.97], [0.7, 0.03], [0.98, 0.02], [1.01, 0.99], [1.49, 0.96], [1.79, 0.99],
  [1.78, 0.01], [2.21, 0.06], [2.35, 0.25], [2.19, 0.47], [1.8, 0.5], [2.43, 0.68], [2.38, 0.89], [2.16, 1],
];

export const CONSTELLATION_EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [7, 12], [12, 8], [8, 9], [9, 10], [10, 11], [11, 12], [11, 13], [13, 14], [14, 15], [15, 7],
];

/** Apparent size of each anchor star. */
export const CONSTELLATION_MAGNITUDES: readonly number[] = [3, 2.4, 2.3, 2.9, 2.7, 2.1, 2.6, 2.3, 3.4, 2.1, 2.5, 1.9, 2, 2.3, 2.7, 2.1];

export const CONSTELLATION_WIDTH = 2.44;

/** Index of the anchor that is the hero "point of light" before the split. */
export const HERO_STAR = 8;

/** Park–Miller minimal standard generator: deterministic so every visit draws the same sky. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export const SKY_SEED = 20261013;
