/**
 * Re-evaluates rank and badges after RP was awarded (moderator approval, appeal overturn, confirmed peer
 * help, backfill, directory launch). Best-effort by design: the award is already stored, so a failure
 * here is logged and never undoes or fails it. Both evaluations are idempotent, and the weekly period
 * finalization re-evaluates ranks, so a skipped run is caught up later.
 */
import type { AppDb } from "@/lib/db";
import { evaluateBadges } from "./badges";
import { evaluateRank } from "./ranks";
import type { RankKey } from "./types";

export interface ProgressionRefresh {
  /** Rank granted by this refresh, null when none, "failed" when the evaluation threw. */
  rank: RankKey | null | "failed";
  /** Number of badges granted, or "failed". */
  badges: number | "failed";
}

export async function refreshProgression(
  db: AppDb,
  userId: string,
  context: { actorId?: string | null; trigger: string; now?: Date }
): Promise<ProgressionRefresh> {
  const result: ProgressionRefresh = { rank: null, badges: 0 };
  try {
    const evaluation = await evaluateRank(db, userId, { now: context.now, actorId: context.actorId ?? undefined });
    result.rank = evaluation.awarded;
  } catch (err) {
    result.rank = "failed";
    console.error(`builder league: rank evaluation after ${context.trigger} failed`, err instanceof Error ? err.message : err);
  }
  try {
    result.badges = (await evaluateBadges(db, userId)).length;
  } catch (err) {
    result.badges = "failed";
    console.error(`builder league: badge evaluation after ${context.trigger} failed`, err instanceof Error ? err.message : err);
  }
  return result;
}
