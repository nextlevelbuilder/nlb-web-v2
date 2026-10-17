/**
 * Engraved star-atlas medallion for a badge: a graduated outer ring like an astrolabe limb, a mono roman
 * numeral at the centre and a small constellation whose star count grows with rarity. Earned medallions are
 * drawn in the accent colour; locked ones are a dashed graphite outline. Decorative: the badge name is
 * always rendered as text next to it.
 */
import type { BadgeRarity } from "@/lib/builder-league/badges";

const RARITY_STARS: Record<BadgeRarity, number> = { common: 2, uncommon: 3, rare: 4, legendary: 5 };
const TICKS = Array.from({ length: 48 }, (_, i) => i);

function hash(value: string): number {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Deterministic star positions on the inner field, so every badge has its own small constellation. */
function constellation(seed: string, count: number): [number, number][] {
  let h = hash(seed);
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const angle = ((h % 360) * Math.PI) / 180;
    const radius = 22 + ((h >>> 9) % 9);
    points.push([60 + Math.cos(angle) * radius, 60 + Math.sin(angle) * radius]);
  }
  return points.sort((a, b) => Math.atan2(a[1] - 60, a[0] - 60) - Math.atan2(b[1] - 60, b[0] - 60));
}

interface BadgeMedallionProps {
  badgeKey: string;
  numeral: string;
  rarity: BadgeRarity;
  earned: boolean;
  /** Seasonal awards get a second inner ring. */
  seasonal?: boolean;
  className?: string;
}

export function BadgeMedallion({ badgeKey, numeral, rarity, earned, seasonal = false, className }: BadgeMedallionProps) {
  const stars = constellation(badgeKey, RARITY_STARS[rarity]);
  const tone = earned ? "text-primary" : "text-ink-3";
  return (
    <svg viewBox="0 0 120 120" aria-hidden focusable="false" className={`${tone} ${className ?? ""}`}>
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray={earned ? undefined : "3 3"} />
      <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="0.6" opacity={earned ? 0.8 : 0.5} />
      {TICKS.map((i) => {
        const major = i % 12 === 0;
        const angle = (i / TICKS.length) * Math.PI * 2;
        const inner = major ? 44 : 47;
        return (
          <line
            key={i}
            x1={60 + Math.cos(angle) * inner}
            y1={60 + Math.sin(angle) * inner}
            x2={60 + Math.cos(angle) * 50}
            y2={60 + Math.sin(angle) * 50}
            stroke="currentColor"
            strokeWidth={major ? 1 : 0.5}
            opacity={earned ? 0.9 : 0.45}
          />
        );
      })}
      {seasonal ? <circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1 2" /> : null}
      {earned ? (
        <polyline points={stars.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.55" />
      ) : null}
      {stars.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 0 ? 1.8 : 1.2} fill="currentColor" opacity={earned ? 1 : 0.5} />
      ))}
      <text
        x="60"
        y="60"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        className="font-mono"
        fontSize={numeral.length > 3 ? 13 : 16}
        letterSpacing="1.5"
      >
        {numeral}
      </text>
    </svg>
  );
}
