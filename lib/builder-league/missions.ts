/**
 * Stage-aware missions. A mission is an outcome worth proving next, recommended from the member's
 * verified history; it links to the evidence form for its event type.
 *
 * - Nothing is locked: every mission is always available, and work done out of order still counts.
 * - Loops are expected: a verified stop/pivot opens a new cycle, so recommendations return to
 *   VALIDATE while the previous cycle stays in history.
 * - No streaks, deadlines or penalties: recommendations only look at what is verified or in review.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { activityEvidence } from "@/lib/db/schema";
import { getVerifiedHistory, type VerifiedEvent } from "./verified-history";
import type { EventTypeKey, Stage } from "./types";

export const MISSION_KEYS = [
  "problem_discovery",
  "customer_interviews",
  "qualified_waitlist",
  "willingness_to_pay",
  "scoped_mvp",
  "first_core_action",
  "public_launch",
  "distribution_experiment",
  "first_payment",
  "help_a_builder",
  "contributor_work",
] as const;
export type MissionKey = (typeof MISSION_KEYS)[number];

export interface MissionDefinition {
  key: MissionKey;
  stage: Stage;
  /** Evidence type that completes the mission (and pre-fills the form). */
  eventType: EventTypeKey;
  /** Position on the build path; contribute missions sit outside the path. */
  pathIndex: number | null;
}

export const MISSIONS: readonly MissionDefinition[] = [
  { key: "problem_discovery", stage: "validate", eventType: "validate_problem_signal", pathIndex: 0 },
  { key: "customer_interviews", stage: "validate", eventType: "validate_interviews", pathIndex: 1 },
  { key: "qualified_waitlist", stage: "validate", eventType: "validate_waitlist", pathIndex: 2 },
  { key: "willingness_to_pay", stage: "validate", eventType: "validate_wtp_commitment", pathIndex: 3 },
  { key: "scoped_mvp", stage: "build", eventType: "build_mvp", pathIndex: 4 },
  { key: "first_core_action", stage: "build", eventType: "build_first_real_user", pathIndex: 5 },
  { key: "public_launch", stage: "ship", eventType: "ship_product_launch", pathIndex: 6 },
  { key: "distribution_experiment", stage: "ship", eventType: "ship_distribution_case_study", pathIndex: 7 },
  { key: "first_payment", stage: "ship", eventType: "ship_first_payment", pathIndex: 8 },
  { key: "help_a_builder", stage: "contribute", eventType: "contribute_peer_help", pathIndex: null },
  { key: "contributor_work", stage: "contribute", eventType: "contribute_contributor_work", pathIndex: null },
];

/** Event types that close a cycle and send the member back to VALIDATE. */
const LOOP_EVENT_TYPES: readonly EventTypeKey[] = ["validate_stop_pivot"];

export type MissionStatus = "done" | "in_review" | "recommended" | "available";

export interface MissionState {
  key: MissionKey;
  stage: Stage;
  eventType: EventTypeKey;
  status: MissionStatus;
  /** Optional step back, e.g. validation skipped before building. Never required. */
  revisit: boolean;
  /** Evidence form deep link (piece B). */
  href: string;
  completedAt: string | null;
}

export interface MissionPlan {
  /** Stage the member is working in now (from the latest verified event of the current cycle). */
  currentStage: Stage;
  /** 1 for the first idea; +1 after every verified stop/pivot. */
  cycle: number;
  cycleStartedAt: string | null;
  /** True when the latest verified step was a stop/pivot, so the plan restarts at VALIDATE. */
  loopedBack: boolean;
  missions: MissionState[];
  /** Up to three keys, most useful first. */
  recommended: MissionKey[];
}

export function missionHref(eventType: EventTypeKey): string {
  return `/builder-league/evidence/new?type=${encodeURIComponent(eventType)}`;
}

/**
 * Pure: recommendations from a verified history (oldest first) and the event types currently in review.
 * The next step is the first unfinished path mission after the furthest one done in this cycle;
 * unfinished earlier steps are offered as optional revisits; one contribute mission is always offered.
 */
export function planMissions(history: VerifiedEvent[], inReviewTypes: ReadonlySet<string> = new Set()): MissionPlan {
  let cycleStart = 0;
  let cycle = 1;
  history.forEach((event, index) => {
    if (LOOP_EVENT_TYPES.includes(event.eventType)) {
      cycleStart = index + 1;
      cycle += 1;
    }
  });
  const cycleEvents = history.slice(cycleStart);
  const loopedBack = cycle > 1 && cycleEvents.length === 0;
  const doneAt = new Map<EventTypeKey, Date>();
  for (const event of cycleEvents) if (!doneAt.has(event.eventType)) doneAt.set(event.eventType, event.occurredAt);
  // Contribute missions are not tied to an idea, so they stay done across cycles.
  for (const event of history) {
    if (event.stage === "contribute" && !doneAt.has(event.eventType)) doneAt.set(event.eventType, event.occurredAt);
  }

  const pathMissions = MISSIONS.filter((m) => m.pathIndex !== null);
  const furthest = Math.max(-1, ...pathMissions.filter((m) => doneAt.has(m.eventType)).map((m) => m.pathIndex!));
  const next = pathMissions.find((m) => m.pathIndex! > furthest && !doneAt.has(m.eventType) && !inReviewTypes.has(m.eventType));
  const revisits = pathMissions.filter((m) => m.pathIndex! < furthest && !doneAt.has(m.eventType) && !inReviewTypes.has(m.eventType));
  const contribute = MISSIONS.find(
    (m) => m.pathIndex === null && !inReviewTypes.has(m.eventType) && (m.key === "help_a_builder" || !doneAt.has(m.eventType))
  );

  const recommended: MissionKey[] = [];
  if (next) recommended.push(next.key);
  if (revisits[0]) recommended.push(revisits[0].key);
  if (contribute) recommended.push(contribute.key);

  const latestPath = [...cycleEvents].reverse().find((e) => e.stage !== "contribute");
  const currentStage: Stage = loopedBack || !latestPath ? (next?.stage ?? "validate") : latestPath.stage;

  const missions: MissionState[] = MISSIONS.map((mission) => {
    const completed = doneAt.get(mission.eventType);
    // Helping is repeatable, so it can be recommended again after it was done once.
    const status: MissionStatus = recommended.includes(mission.key)
      ? "recommended"
      : completed
        ? "done"
        : inReviewTypes.has(mission.eventType)
          ? "in_review"
          : "available";
    return {
      key: mission.key,
      stage: mission.stage,
      eventType: mission.eventType,
      status,
      revisit: revisits.some((r) => r.key === mission.key),
      href: missionHref(mission.eventType),
      completedAt: completed ? completed.toISOString() : null,
    };
  });

  return {
    currentStage,
    cycle,
    cycleStartedAt: cycle > 1 ? (history[cycleStart - 1]?.occurredAt.toISOString() ?? null) : null,
    loopedBack,
    missions,
    recommended,
  };
}

/** Mission plan of a member from D1: verified history plus evidence still waiting for review. */
export async function getMissionPlan(db: AppDb, userId: string): Promise<MissionPlan> {
  const [history, pending] = await Promise.all([
    getVerifiedHistory(db, userId),
    db
      .select({ eventType: activityEvidence.eventType })
      .from(activityEvidence)
      .where(and(eq(activityEvidence.userId, userId), inArray(activityEvidence.status, ["submitted", "needs_info"]))),
  ]);
  return planMissions(history, new Set(pending.map((row) => row.eventType)));
}
