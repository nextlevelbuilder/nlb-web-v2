import { sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { changesOf, runRawBatch } from "./live-d1-batch";
import { liveTicketFeatureKey } from "./types";
import { LiveError } from "./live-errors";
import { assertTransition } from "./event-lifecycle";
import { loadEvent } from "./events";
import { cancelProviderRegistrants, type CancelRegistrantsResult } from "./meetings/meeting-service";
import type { MeetingProvider } from "./meetings/meeting-provider";

export interface CancelEventResult {
  ticketsRevoked: number;
  /** Provider-side registrant cancellation; null when no provider was given (retry later via the sweep). */
  registrants: CancelRegistrantsResult | null;
}

/**
 * Cancel an event (from draft, scheduled, sales_open or live). The approval for this sensitive
 * action is enforced and audited by the caller. In one batch: the status flips to `cancelled`,
 * every active ticket is cancelled and its entitlement revoked, holds are released, all seats are
 * freed and attendee registrations are cancelled (their join URLs dropped). Paid orders are refunded
 * through Polar by the operator; Polar stays the source of truth for money.
 * Provider registrants are cancelled afterwards, best-effort; failures stay queued for
 * `cancelProviderRegistrants` because access is already revoked in our database.
 */
export async function cancelEvent(
  eventId: string,
  db: AppDb,
  options: { now?: Date; provider?: MeetingProvider | null } = {}
): Promise<CancelEventResult> {
  const now = options.now ?? new Date();
  const at = now.getTime();
  const event = await loadEvent(db, eventId);
  assertTransition(event.status, "cancelled");

  const [cancelled, , revoked] = await runRawBatch(db, [
    sql`
      UPDATE live_events SET status = 'cancelled', cancelled_at = ${at}, updated_at = ${at}
      WHERE id = ${eventId} AND status = ${event.status}`,
    sql`
      UPDATE entitlements SET is_active = 0, valid_until = ${at}
      WHERE feature_key = ${liveTicketFeatureKey(eventId)} AND is_active = 1
        AND EXISTS (SELECT 1 FROM live_events WHERE id = ${eventId} AND status = 'cancelled')`,
    sql`
      UPDATE live_tickets SET status = 'cancelled', revoked_at = ${at}, updated_at = ${at}
      WHERE event_id = ${eventId} AND status = 'active'
        AND EXISTS (SELECT 1 FROM live_events WHERE id = ${eventId} AND status = 'cancelled')`,
    sql`
      UPDATE live_ticket_reservations SET status = 'released', updated_at = ${at}
      WHERE event_id = ${eventId} AND status = 'held'
        AND EXISTS (SELECT 1 FROM live_events WHERE id = ${eventId} AND status = 'cancelled')`,
    sql`
      UPDATE live_seats SET state = 'free', holder_user_id = NULL, reservation_id = NULL, ticket_id = NULL,
        expires_at = NULL, updated_at = ${at}
      WHERE event_id = ${eventId}
        AND EXISTS (SELECT 1 FROM live_events WHERE id = ${eventId} AND status = 'cancelled')`,
    sql`
      UPDATE live_attendee_registrations SET status = 'cancelled', join_url_ciphertext = NULL, updated_at = ${at}
      WHERE event_id = ${eventId} AND status != 'cancelled'
        AND EXISTS (SELECT 1 FROM live_events WHERE id = ${eventId} AND status = 'cancelled')`,
  ]);
  if (changesOf(cancelled) !== 1) throw new LiveError(409, "conflict", "The event changed while cancelling; retry");

  const registrants = options.provider ? await cancelProviderRegistrants({ db, provider: options.provider }, eventId, now) : null;
  return { ticketsRevoked: changesOf(revoked), registrants };
}
