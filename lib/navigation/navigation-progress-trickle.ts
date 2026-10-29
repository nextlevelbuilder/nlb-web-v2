/** The bar never reaches the end on its own: only a committed route fills it to 100%. */
export const TRICKLE_CEILING = 0.92;
const FIRST_STEP = 0.15;
const STEP_RATIO = 0.1;

/**
 * Next scale for the progress bar while a navigation is pending: a visible first step, then ever
 * smaller steps that ease towards the ceiling, so a slow load still looks alive without lying.
 */
export function nextTrickleProgress(current: number): number {
  if (!Number.isFinite(current) || current <= 0) return FIRST_STEP;
  if (current >= TRICKLE_CEILING) return TRICKLE_CEILING;
  return Math.min(TRICKLE_CEILING, current + (TRICKLE_CEILING - current) * STEP_RATIO);
}
