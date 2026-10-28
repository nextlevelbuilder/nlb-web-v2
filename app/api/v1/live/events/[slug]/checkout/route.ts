import { z } from "zod";
import { getDb } from "@/lib/db";
import { BuilderApiError, enforceUserRateLimit, fail, ok } from "@/lib/builder-league/http";
import { holdSeat } from "@/lib/live/seats";
import { createLiveTicketCheckout } from "@/lib/live/live-checkout";
import { withLiveErrors } from "@/lib/live/http/live-http-errors";
import {
  assertLiveEnabled,
  memberDelegationScope,
  readJsonObject,
  requirePathParam,
  resolveLiveSubject,
  withLiveIdempotency,
} from "@/lib/live/http/live-request-context";
import { requireAllowedUser } from "@/lib/live/http/live-member-access";
import { findPublishedEventBySlug } from "@/lib/live/http/live-route-queries";
import { getLivePolarClient } from "@/lib/live/http/live-external-clients";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const bodySchema = z.object({ recordingConsent: z.unknown().optional(), locale: z.enum(["en", "vi"]).optional() }).strict();

/**
 * Start a ticket checkout: `authorize()` purchase (signed in, verified, not banned, write scope), hold
 * one seat for 15 minutes, then create a Polar checkout bound to the buyer and that hold. Repeating
 * the call while the hold is active reuses it, so one buyer never holds two seats. Recording consent
 * (`recordingConsent: true`) is required.
 */
export async function POST(request: Request, { params }: Params) {
  return withLiveErrors(async () => {
    assertLiveEnabled();
    const slug = requirePathParam((await params).slug, "slug");
    const db = getDb();
    const now = new Date();
    const { caller, subject } = await resolveLiveSubject(request, db, memberDelegationScope(request));
    const { text, body } = await readJsonObject(request);
    const event = await findPublishedEventBySlug(db, slug);
    if (!event) return fail(404, "not_found", undefined, "Event not found");
    const userId = await requireAllowedUser(db, subject, "purchase", { kind: "live_event", id: event.id }, now);

    const input = bodySchema.parse(body);
    if (input.recordingConsent !== true) {
      return fail(400, "recording_consent_required", undefined, "Accept that the session is recorded and the replay may be sold");
    }
    if (!caller?.user.email) throw new BuilderApiError(400, "invalid_input", "Your account has no email address");
    enforceUserRateLimit(userId, "live-checkout");

    return withLiveIdempotency(request, db, userId, text, async () => {
      const { reservation } = await holdSeat({ eventId: event.id, userId, now, recordingConsent: true }, db);
      const checkout = await createLiveTicketCheckout(
        event,
        { id: userId, email: caller.user.email },
        reservation,
        await getLivePolarClient(),
        input.locale,
        { db, now }
      );
      return ok({ url: checkout.url, reservationExpiresAt: reservation.expiresAt });
    });
  });
}
