/**
 * NLB Live housekeeping, run from the `scheduled` handler in worker.ts and on demand through
 * `POST /api/v1/live-admin/sweeps`:
 *
 * - return expired seat holds to the pool (holds are also reclaimed lazily at checkout, so this keeps
 *   reservation statuses and seat counts tidy);
 * - cancel provider registrants whose ticket was refunded or whose event was cancelled, so a revoked
 *   attendee's personal join link stops working at the provider too.
 *
 * Both steps are idempotent and bounded, and one failing step never blocks the other. The sweep runs
 * whatever `LIVE_ENABLED` says: operators prepare events with the flag off, and revocations must reach
 * the provider either way.
 */
import { createDb, type AppDb } from "@/lib/db";
import { releaseExpiredHolds } from "./seats";
import { cancelProviderRegistrants, type CancelRegistrantsResult } from "./meetings/meeting-service";
import type { MeetingProvider } from "./meetings/meeting-provider";
import { createZoomMeetingProvider } from "./meetings/zoom-meeting-provider";

/**
 * Reuses the existing every-minute trigger in wrangler.jsonc (the onboarding job queue), so Live adds
 * no schedule of its own. Each run costs two conditional UPDATEs and one bounded SELECT when there is
 * nothing to do, and keeps registrant cancellation within about a minute of a refund.
 */
export const LIVE_CRON = "* * * * *";

export interface LiveSweepResult {
  seatsReleased: number | null;
  registrants: CancelRegistrantsResult | null;
  errors: string[];
}

export async function runLiveSweeps(db: AppDb, now: Date, provider: MeetingProvider | null): Promise<LiveSweepResult> {
  const result: LiveSweepResult = { seatsReleased: null, registrants: null, errors: [] };
  try {
    result.seatsReleased = (await releaseExpiredHolds(db, now)).seatsReleased;
  } catch (error) {
    console.error("live sweep: releasing expired holds failed", error instanceof Error ? error.message : error);
    result.errors.push("release_expired_holds");
  }
  try {
    result.registrants = await cancelProviderRegistrants({ db, provider });
  } catch (error) {
    console.error("live sweep: cancelling provider registrants failed", error instanceof Error ? error.message : error);
    result.errors.push("cancel_provider_registrants");
  }
  return result;
}

export interface LiveCronEnv {
  DB: D1Database;
  ZOOM_ACCOUNT_ID?: string;
  ZOOM_CLIENT_ID?: string;
  ZOOM_CLIENT_SECRET?: string;
}

/** Zoom credentials straight from the scheduled env (no request context exists in a cron run). */
function zoomFromEnv(env: LiveCronEnv): MeetingProvider {
  const accountId = env.ZOOM_ACCOUNT_ID?.trim();
  const clientId = env.ZOOM_CLIENT_ID?.trim();
  const clientSecret = env.ZOOM_CLIENT_SECRET?.trim();
  return createZoomMeetingProvider({
    credentials: accountId && clientId && clientSecret ? { accountId, clientId, clientSecret } : null,
  });
}

export async function runLiveCron(env: LiveCronEnv, now: Date = new Date()): Promise<LiveSweepResult> {
  return runLiveSweeps(createDb(env.DB), now, zoomFromEnv(env));
}
