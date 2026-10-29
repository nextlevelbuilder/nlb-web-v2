/**
 * Shared NLB Live vocabulary. Lifecycle rules are in docs/live-and-access-adr.md and enforced by
 * `lib/live/event-lifecycle.ts`.
 */

export const LIVE_TIMEZONE = "Asia/Ho_Chi_Minh";

/** How long a checkout holds a seat before it returns to the pool. */
export const LIVE_SEAT_HOLD_MS = 15 * 60 * 1000;

/** How long before `startsAt` an authorized attendee may fetch join access. */
export const LIVE_JOIN_OPENS_BEFORE_MS = 15 * 60 * 1000;

export type LiveTopicStatus = "active" | "archived";

/** `scheduled`/`open`/`closed` follow the clock; `finalized` is set once results are frozen. */
export type LivePollRoundStatus = "scheduled" | "open" | "closed" | "finalized";

export type LiveEventStatus = "draft" | "scheduled" | "sales_open" | "live" | "ended" | "cancelled" | "archived";

export type LiveSeatState = "free" | "held" | "ticketed";

export type LiveReservationStatus = "held" | "converted" | "expired" | "released";

/**
 * `active` grants `live:ticket:<eventId>`; `refunded`/`cancelled` revoke it; `exception` is a paid order
 * that could not become a seat (sold out after hold expiry, no matching account) and needs an operator.
 */
export type LiveTicketStatus = "active" | "refunded" | "cancelled" | "exception";

export type LiveMeetingProviderName = "zoom";

/**
 * `cancelled`: access revoked; a kept provider registrant id means the provider cancellation is still
 * pending. `cancel_abandoned`: that cancellation kept failing until the event ended, so the sweep gave
 * up (terminal; the registrant id is kept for manual clean-up).
 */
export type LiveAttendeeRegistrationStatus = "pending" | "registered" | "failed" | "cancelled" | "cancel_abandoned";

/** Entitlement feature key for attending one event. Never implied by Premium/VIP membership. */
export function liveTicketFeatureKey(eventId: string): string {
  return `live:ticket:${eventId}`;
}

/** Entitlement feature key for early replay of one event (granted in P2). */
export function liveReplayFeatureKey(eventId: string): string {
  return `live:replay:${eventId}`;
}

/** Polar checkout metadata `kind` for Live tickets. */
export const LIVE_TICKET_PRODUCT_KIND = "live_ticket";
