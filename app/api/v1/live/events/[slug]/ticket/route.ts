import { getDb } from "@/lib/db";
import { fail, ok } from "@/lib/builder-league/http";
import { getMyTicketStatus } from "@/lib/live/event-read-models";
import { withLiveErrors } from "@/lib/live/http/live-http-errors";
import { assertLiveEnabled, memberDelegationScope, requirePathParam, resolveLiveSubject } from "@/lib/live/http/live-request-context";
import { requireAllowedUser } from "@/lib/live/http/live-member-access";
import { findPublishedEventBySlug } from "@/lib/live/http/live-route-queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/**
 * The caller's ticket (latest, any status) and active seat hold for an event. Signed in only: the
 * caller must pass the `live:event` read rule as themselves (not banned, read scope).
 */
export async function GET(request: Request, { params }: Params) {
  return withLiveErrors(async () => {
    assertLiveEnabled();
    const slug = requirePathParam((await params).slug, "slug");
    const db = getDb();
    const now = new Date();
    const { subject } = await resolveLiveSubject(request, db, memberDelegationScope(request));
    const event = await findPublishedEventBySlug(db, slug);
    if (!event) return fail(404, "not_found", undefined, "Event not found");
    const userId = await requireAllowedUser(db, subject, "read", { kind: "live_event", id: event.id }, now);
    return ok({ eventId: event.id, ...(await getMyTicketStatus(db, event.id, userId, now)) });
  });
}
