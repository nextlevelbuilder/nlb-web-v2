import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { listPastEvents, listUpcomingEvents } from "@/lib/live/event-read-models";
import { withLiveErrors } from "@/lib/live/http/live-http-errors";
import { assertLiveEnabled } from "@/lib/live/http/live-request-context";
import { checkAccess } from "@/lib/live/http/live-member-access";
import { ANONYMOUS_SUBJECT } from "@/lib/live/http/live-public-subject";

export const dynamic = "force-dynamic";

/**
 * Published Live events: upcoming (scheduled, on sale, live) soonest first and past (ended, archived)
 * newest first. Drafts never appear. Public: the response does not depend on the viewer, so the
 * events are checked against the public `live:event` read rule; a deny drops the event (fail closed).
 */
export async function GET() {
  return withLiveErrors(async () => {
    assertLiveEnabled();
    const db = getDb();
    const now = new Date();
    const [upcoming, past] = await Promise.all([listUpcomingEvents(db, now, 50), listPastEvents(db, now, 50)]);
    const visible = async (events: typeof upcoming) => {
      const decisions = await Promise.all(events.map((event) => checkAccess(db, ANONYMOUS_SUBJECT, "read", { kind: "live_event", id: event.id }, now)));
      return events.filter((_, index) => decisions[index].allow);
    };
    return ok({ upcoming: await visible(upcoming), past: await visible(past) });
  });
}
