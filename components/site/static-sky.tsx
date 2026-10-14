import { buildSkyFallbackMarkup, FALLBACK_VIEWBOX } from '@/lib/constellation/sky-fallback';

// Built once per server instance: the markup is deterministic (seeded) and contains only numbers.
const STARS = buildSkyFallbackMarkup({ stars: 150, constellation: false });

/**
 * Lightweight sky on every page: an engraved star field plus the chart graticule. No WebGL and no
 * scroll story; the home page paints its live sky canvas over it.
 */
export default function StaticSky() {
  return (
    <>
      <div className="static-sky" aria-hidden="true">
        <svg viewBox={FALLBACK_VIEWBOX} preserveAspectRatio="xMidYMid slice" dangerouslySetInnerHTML={{ __html: STARS }} />
      </div>
      <div className="graticule" aria-hidden="true" />
    </>
  );
}
