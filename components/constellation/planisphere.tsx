const HOURS = Array.from({ length: 12 }, (_, i) => i * 2);

/** The engraved planisphere around the hero point of light (hour ring, declination circles, ecliptic). */
export default function Planisphere() {
  return (
    <div className="planisphere" aria-hidden="true">
      <div className="ps-intro">
        <svg viewBox="-500 -500 1000 1000">
          <g className="ps-rot">
            <circle className="pl-faint" r="486" />
            <circle className="pl-tick" r="474" pathLength="360" strokeDasharray=".07 .93" strokeWidth="12" opacity=".7" />
            <circle className="pl-tick" r="469" pathLength="72" strokeDasharray=".035 .965" strokeWidth="22" />
            <circle className="pl-faint" r="456" />
            <g className="ps-labels">
              {HOURS.map((h) => {
                const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
                return (
                  <text key={h} x={(Math.cos(a) * 432).toFixed(1)} y={(Math.sin(a) * 432 + 4).toFixed(1)} textAnchor="middle">{h}h</text>
                );
              })}
            </g>
            <circle className="pl-faint" r="330" strokeDasharray="2 7" />
            <circle className="pl-faint" r="200" strokeDasharray="2 7" />
            <circle className="pl-faint" r="80" strokeDasharray="1 5" />
            <path className="pl-faint" d="M-456 0H456M0-456V456" strokeDasharray="1 6" />
            <ellipse className="pl-ecl" rx="450" ry="150" transform="rotate(-23.4)" strokeDasharray="6 6" />
          </g>
        </svg>
      </div>
    </div>
  );
}
