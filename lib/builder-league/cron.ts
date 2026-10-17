/**
 * Builder League scheduled work, called from the `scheduled` handler in `worker.ts`:
 *
 * - finalize due league periods (rankings piece, loaded only if present);
 * - publish the provisional Year in Review and Community Wrapped once Dec 30 has closed (local time);
 * - freeze the final ones after Dec 31 plus the moderation grace period;
 * - expire render jobs and delete their outputs past retention.
 *
 * Every step is idempotent and bounded per run (`USERS_PER_RUN`), so an hourly cron catches up over a
 * few runs. One failing step never blocks the others.
 */
import { and, eq, gt, or, sql } from "drizzle-orm";
import { createDb, type AppDb } from "@/lib/db";
import { yearlySnapshots } from "@/lib/db/schema";
import { ensureCommunityWrapped } from "./community-wrapped";
import { expireRenderJobs, type RenderBucket } from "./render-jobs";
import { localYear } from "./time-windows";
import { ensureYearSnapshot, listYearParticipants, yearWindow } from "./year-review";

export const USERS_PER_RUN = 100;

export interface BuilderLeagueCronEnv {
  DB: D1Database;
  BUILDER_EVIDENCE?: RenderBucket | null;
}

export interface BuilderLeagueCronResult {
  cron: string;
  periodsFinalized: "done" | "skipped" | "failed";
  yearSnapshots: { year: number; status: "provisional" | "final"; created: number; pending: number } | null;
  communityWrapped: { year: number; status: "provisional" | "final"; created: boolean } | null;
  renderJobsExpired: number;
  errors: string[];
}

type FinalizeDuePeriods = (db: AppDb, now: Date) => Promise<unknown>;

/** Piece C's period finalizer, if that module is deployed; never a hard dependency. */
async function loadFinalizeDuePeriods(): Promise<FinalizeDuePeriods | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore The rankings module ships separately; when it is absent this import fails and is skipped.
    const mod: Record<string, unknown> = await import("./snapshots");
    return typeof mod.finalizeDuePeriods === "function" ? (mod.finalizeDuePeriods as FinalizeDuePeriods) : null;
  } catch {
    return null;
  }
}

/** Which year is due and with which status at `now`, if any. */
export function dueYear(now: Date): { year: number; status: "provisional" | "final" } | null {
  const current = localYear(now);
  const previous = yearWindow(current - 1);
  const at = now.getTime();
  // Until the previous year is final, keep catching up its provisional snapshots.
  if (at < previous.finalAt) return { year: current - 1, status: "provisional" };
  if (at < previous.finalAt + 60 * 86_400_000) return { year: current - 1, status: "final" };
  if (at > yearWindow(current).provisionalCutoff) return { year: current, status: "provisional" };
  return null;
}

async function runYearSnapshots(db: AppDb, year: number, status: "provisional" | "final", now: Date) {
  const window = yearWindow(year);
  const readUntil = status === "final" ? window.finalAt - 1 : window.provisionalCutoff;
  const participants = await listYearParticipants(db, year, readUntil);
  const doneRows = participants.length === 0 ? [] : await db
    .select({ userId: yearlySnapshots.userId })
    .from(yearlySnapshots)
    .where(and(
      eq(yearlySnapshots.year, year),
      status === "final"
        ? eq(yearlySnapshots.status, "final")
        : or(gt(yearlySnapshots.createdAt, new Date(window.provisionalCutoff)), sql`json_extract(${yearlySnapshots.provenance}, '$.confirmedAt') > ${window.provisionalCutoff}`)
    ));
  const done = new Set(doneRows.map((row) => row.userId));
  const todo = participants.filter((userId) => !done.has(userId));
  let created = 0;
  for (const userId of todo.slice(0, USERS_PER_RUN)) {
    const result = await ensureYearSnapshot(db, userId, year, now);
    // A snapshot stored before the cutoff that is still current is marked confirmed (metadata only,
    // the data stays untouched), so the next run moves on to other members.
    if (!result.created && status === "provisional" && result.snapshot.createdAt.getTime() <= window.provisionalCutoff) {
      await db
        .update(yearlySnapshots)
        .set({ provenance: { ...result.snapshot.provenance, confirmedAt: now.getTime() } })
        .where(eq(yearlySnapshots.id, result.snapshot.id));
    }
    if (result.created) created += 1;
  }
  return { year, status, created, pending: Math.max(todo.length - USERS_PER_RUN, 0) };
}

export async function runBuilderLeagueCron(env: BuilderLeagueCronEnv, cron: string, now = new Date(), db: AppDb = createDb(env.DB)): Promise<BuilderLeagueCronResult> {
  const result: BuilderLeagueCronResult = {
    cron,
    periodsFinalized: "skipped",
    yearSnapshots: null,
    communityWrapped: null,
    renderJobsExpired: 0,
    errors: [],
  };
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      result.errors.push(name);
      console.error(`builder league cron: ${name} failed`, err instanceof Error ? err.message : err);
    }
  };

  await step("periods", async () => {
    const finalize = await loadFinalizeDuePeriods();
    if (!finalize) return;
    try {
      await finalize(db, now);
      result.periodsFinalized = "done";
    } catch (err) {
      result.periodsFinalized = "failed";
      throw err;
    }
  });

  const due = dueYear(now);
  if (due) {
    await step("community_wrapped", async () => {
      const { snapshot, created } = await ensureCommunityWrapped(db, due.year, now);
      result.communityWrapped = { year: due.year, status: snapshot.status, created };
    });
    await step("year_snapshots", async () => {
      result.yearSnapshots = await runYearSnapshots(db, due.year, due.status, now);
    });
  }

  await step("render_expiry", async () => {
    result.renderJobsExpired = await expireRenderJobs(db, env.BUILDER_EVIDENCE ?? null, now);
  });

  return result;
}
