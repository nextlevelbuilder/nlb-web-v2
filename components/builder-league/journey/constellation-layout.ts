import type { JourneyItem } from "@/lib/builder-league/journey";
import { STAGES, type Stage } from "@/lib/builder-league/types";

export interface ConstellationStar {
  id: string;
  x: number;
  y: number;
  r: number;
  stage: Stage | null;
  label: string;
  learning: boolean;
}

export const CONSTELLATION_VIEWBOX = { width: 1000, height: 420 };
const PAD_X = 48;
const LANE_TOP = 70;
const LANE_GAP = 90;

/**
 * Places verified steps on a star chart: time runs left to right, each stage has its own lane, and
 * consecutive steps are joined in order. Deterministic, so the server and client render the same chart.
 */
export function layoutConstellation(items: readonly JourneyItem[], label: (item: JourneyItem) => string): { stars: ConstellationStar[]; lanes: { stage: Stage; y: number }[] } {
  const lanes = STAGES.map((stage, i) => ({ stage, y: LANE_TOP + i * LANE_GAP }));
  const laneY = new Map(lanes.map((lane) => [lane.stage, lane.y]));
  const visible = items.filter((item) => item.state === "verified" && (item.source === "event" || item.source === "rank" || item.source === "badge"));
  if (visible.length === 0) return { stars: [], lanes };
  const first = visible[0].occurredAt;
  const span = Math.max(visible[visible.length - 1].occurredAt - first, 1);
  const width = CONSTELLATION_VIEWBOX.width - PAD_X * 2;
  const stars = visible.map((item, index) => {
    const base = item.stage ? laneY.get(item.stage)! : LANE_TOP + 1.5 * LANE_GAP;
    // A small deterministic offset keeps same-day steps from sitting on top of each other.
    const jitter = ((index * 37) % 5) * 6 - 12;
    return {
      id: item.id,
      x: visible.length === 1 ? CONSTELLATION_VIEWBOX.width / 2 : PAD_X + ((item.occurredAt - first) / span) * width,
      y: base + jitter,
      r: item.source === "event" ? (item.rp >= 50 ? 6 : 4) : 5,
      stage: item.stage,
      label: label(item),
      learning: item.learning,
    };
  });
  return { stars, lanes };
}
