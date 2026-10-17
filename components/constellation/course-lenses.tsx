/**
 * The three observatory "lens" illustrations from the Constellation course cards (decorative).
 *
 * By default the planets orbit with SVG SMIL loops, which the home engine pauses for reduced motion.
 * Inner pages have no engine, and CSS cannot stop SMIL, so they pass `still` to draw the same lens
 * with planets parked on their orbits instead.
 */
export interface LensProps {
  still?: boolean;
}

export function LensFeature({ still = false }: LensProps) {
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true">
      <path className="grid-l" d="M0 100H320M160 0V200" />
      <g transform="translate(160 108)">
        <ellipse className="orbit" rx="122" ry="40" /><ellipse className="orbit dash" rx="78" ry="26" transform="rotate(-8)" />
        {still ? (
          <><circle className="planet" r="4.5" cx="-86" cy="28" /><circle className="planet" r="2.5" cx="55" cy="-18" /></>
        ) : (
          <>
            <circle className="planet" r="4.5"><animateMotion dur="22s" repeatCount="indefinite" path="M-122 0a122 40 0 1 0 244 0a122 40 0 1 0-244 0" /></circle>
            <circle className="planet" r="2.5"><animateMotion dur="11s" repeatCount="indefinite" path="M78 0a78 26 0 1 1-156 0a78 26 0 1 1 156 0" /></circle>
          </>
        )}
        <circle className="halo" r="18" /><path className="spk" d="M-22 0H22M0-22V22" /><circle className="core" r="4.5" />
      </g>
    </svg>
  );
}

export function LensRinged({ still = false }: LensProps) {
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true">
      <path className="grid-l" d="M0 100H320M160 0V200" />
      <g transform="translate(160 104)">
        <ellipse className="orbit" rx="64" ry="14" transform="rotate(-14)" /><ellipse className="orbit" rx="82" ry="19" transform="rotate(-14)" opacity=".6" />
        <ellipse className="orbit dash" rx="134" ry="48" transform="rotate(6)" />
        {still ? (
          <circle className="planet" r="3.5" cx="-123" cy="-29" />
        ) : (
          <circle className="planet" r="3.5"><animateMotion dur="30s" repeatCount="indefinite" path="M-134 0a134 48 0 1 0 268 0a134 48 0 1 0-268 0" /></circle>
        )}
        <circle className="halo" r="22" /><path className="spk" d="M-26 0H26M0-26V26" /><circle className="core" r="7" />
      </g>
    </svg>
  );
}

export function LensBinary({ still = false }: LensProps) {
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true">
      <path className="grid-l" d="M0 100H320M160 0V200" />
      <g transform="translate(160 102)">
        <ellipse className="orbit dash" rx="104" ry="34" /><circle className="orbit" r="58" opacity=".5" />
        <g transform={still ? "rotate(-24)" : undefined}>
          {!still && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="26s" repeatCount="indefinite" />}
          <circle className="halo" cx="-20" r="14" /><circle className="core" cx="-20" r="4" /><circle className="planet" cx="24" r="3" />
        </g>
        {still ? (
          <circle className="planet" r="2.5" cx="74" cy="24" />
        ) : (
          <circle className="planet" r="2.5"><animateMotion dur="18s" repeatCount="indefinite" path="M104 0a104 34 0 1 1-208 0a104 34 0 1 1 208 0" /></circle>
        )}
        <path className="spk" d="M-20 0H20M0-20V20" opacity="0" />
      </g>
    </svg>
  );
}

export const LENSES = [LensFeature, LensRinged, LensBinary] as const;
export const LENS_COORDS = ['RA 05h 35m', 'RA 05h 41m', 'RA 05h 32m'] as const;
