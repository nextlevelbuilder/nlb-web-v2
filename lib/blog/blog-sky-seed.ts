/**
 * Deterministic decoration for posts: a stable sky coordinate and orbit-lens variant derived from the
 * slug, so a post keeps the same plate on every render (no randomness, no hydration drift).
 */

/** FNV-1a 32-bit hash of a string. */
export function seedFrom(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "RA 14h 22m · Dec +12° 08′" with RA 0-23h 59m and Dec -89°…+89°. */
export function skyCoordinate(seed: number): string {
  const ra = seed % 1440;
  const decMinutes = Math.floor(seed / 1440) % (179 * 60);
  const dec = decMinutes - 89 * 60;
  const sign = dec < 0 ? "−" : "+";
  const abs = Math.abs(dec);
  return `RA ${pad(Math.floor(ra / 60))}h ${pad(ra % 60)}m · Dec ${sign}${pad(Math.floor(abs / 60))}° ${pad(abs % 60)}′`;
}

export const LENS_VARIANTS = 3;

export function lensVariant(seed: number): number {
  return seed % LENS_VARIANTS;
}
