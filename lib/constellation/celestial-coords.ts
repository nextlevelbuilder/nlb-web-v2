const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

/**
 * Map a viewport position to right ascension / declination, as if the window were a star chart:
 * x spans 0h..24h, y spans +90°..−90°. Used by the hook's live "cursor position" readout.
 */
export function formatCelestialCoord(x: number, y: number, width: number, height: number): string {
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  const cx = Math.min(Math.max(x, 0), w - 1e-9);
  const cy = Math.min(Math.max(y, 0), h);
  const ra = (cx / w) * 24;
  const hours = Math.floor(ra);
  const minutesFloat = (ra - hours) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.floor((minutesFloat - minutes) * 60);
  const dec = 90 - (cy / h) * 180;
  const sign = dec < 0 ? '−' : '+';
  const abs = Math.abs(dec);
  const degrees = Math.floor(abs);
  const arcMinutes = Math.floor((abs - degrees) * 60);
  return `RA ${pad2(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s · Dec ${sign}${pad2(degrees)}° ${pad2(arcMinutes)}′`;
}
