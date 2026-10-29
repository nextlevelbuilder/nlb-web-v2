import { getDb } from "@/lib/db";
import { fail, ok } from "@/lib/builder-league/http";
import { LIVE_JOIN_OPENS_BEFORE_MS } from "@/lib/live/types";
import { getJoinAccess } from "@/lib/live/meetings/join-access";
import { accessDenied, withLiveErrors } from "@/lib/live/http/live-http-errors";
import { assertLiveEnabled, memberDelegationScope, requirePathParam, resolveLiveSubject } from "@/lib/live/http/live-request-context";
import { checkAccess } from "@/lib/live/http/live-member-access";
import { findPublishedEventBySlug } from "@/lib/live/http/live-route-queries";
import { getLiveMeetingProvider } from "@/lib/live/http/live-external-clients";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/**
 * Join access for the caller. `authorize()` join on `live:ticket:<eventId>` (active ticket and
 * entitlement; membership never counts) must allow before `getJoinAccess` runs. Without a ticket the
 * answer is `no_ticket` with no join URL. The personal join URL is returned only to the ticket holder
 * inside the join window (15 minutes before start until the end); never cached.
 */
export async function GET(request: Request, { params }: Params) {
  const response = await withLiveErrors(async () => {
    assertLiveEnabled();
    const slug = requirePathParam((await params).slug, "slug");
    const db = getDb();
    const now = new Date();
    const { subject } = await resolveLiveSubject(request, db, memberDelegationScope(request));
    const event = await findPublishedEventBySlug(db, slug);
    if (!event) return fail(404, "not_found", undefined, "Event not found");

    const decision = await checkAccess(db, subject, "join", { kind: "live_ticket", eventId: event.id }, now);
    if (!decision.allow) {
      if (decision.reason !== "no_entitlement") throw accessDenied(decision.reason);
      const opensAt = new Date(event.startsAt.getTime() - LIVE_JOIN_OPENS_BEFORE_MS);
      return ok({ status: "no_ticket", opensAt, endsAt: event.endsAt });
    }

    const access = await getJoinAccess(
      { eventId: event.id, userId: subject.userId as string, now },
      { db, provider: getLiveMeetingProvider() }
    );
    return ok({
      status: access.status,
      ...(access.status === "open" && access.joinUrl ? { joinUrl: access.joinUrl } : {}),
      opensAt: access.opensAt,
      endsAt: access.endsAt,
    });
  });
  // Join URLs are personal: never stored by browsers or shared caches, whatever the outcome.
  response.headers.set("cache-control", "no-store, private");
  return response;
}
