import { getDb } from "@/lib/db";
import { fail, ok } from "@/lib/builder-league/http";
import { getPublicEventBySlug } from "@/lib/live/event-read-models";
import { withLiveErrors } from "@/lib/live/http/live-http-errors";
import { assertLiveEnabled, requirePathParam } from "@/lib/live/http/live-request-context";
import { requireAllowed } from "@/lib/live/http/live-member-access";
import { ANONYMOUS_SUBJECT } from "@/lib/live/http/live-public-subject";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** One published event with `seatsLeft` (while sales are open). Drafts and unknown slugs are 404. */
export async function GET(_request: Request, { params }: Params) {
  return withLiveErrors(async () => {
    assertLiveEnabled();
    const slug = requirePathParam((await params).slug, "slug");
    const db = getDb();
    const now = new Date();
    const event = await getPublicEventBySlug(db, slug, now);
    if (!event) return fail(404, "not_found", undefined, "Event not found");
    await requireAllowed(db, ANONYMOUS_SUBJECT, "read", { kind: "live_event", id: event.id }, now);
    return ok(event);
  });
}
