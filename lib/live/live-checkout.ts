import { and, eq } from "drizzle-orm";
import type { Polar } from "@polar-sh/sdk";
import type { AppDb } from "@/lib/db";
import { liveTicketReservations } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { localizedPath } from "@/lib/seo";
import { getMemberTier } from "@/lib/membership/member-access";
import { LIVE_TICKET_PRODUCT_KIND } from "./types";
import { LiveError, LiveRecordingConsentRequiredError } from "./live-errors";
import type { LiveEventRow } from "./events";
import type { LiveReservation } from "./seats";

export interface LivePolarCheckoutsClient {
  checkouts: Pick<Polar["checkouts"], "create">;
}

export interface LiveCheckoutBuyer {
  id: string;
  email: string;
}

export interface LiveCheckoutDeps {
  db: AppDb;
  now?: Date;
}

/** Locale-aware path to the event page; the default locale (en) has no prefix. */
export function liveEventPath(slug: string, locale?: "en" | "vi"): string {
  return localizedPath(`/live/${encodeURIComponent(slug)}`, locale ?? "en");
}

/**
 * Member discount for a ticket: VIP members get the event's `vipDiscountId`, Premium members its
 * `premiumDiscountId`, when configured. Membership never implies a ticket, only a price.
 */
export async function resolveMemberDiscountId(
  event: Pick<LiveEventRow, "vipDiscountId" | "premiumDiscountId">,
  userId: string,
  db: AppDb,
  now: Date
): Promise<string | null> {
  if (!event.vipDiscountId && !event.premiumDiscountId) return null;
  const { tier } = await getMemberTier(db, userId, now);
  if (tier === "vip") return event.vipDiscountId ?? null;
  if (tier === "premium") return event.premiumDiscountId ?? null;
  return null;
}

/**
 * Create a Polar checkout for a held seat, bound to the signed-in buyer. Refuses unless sales are
 * open, the reservation is the buyer's unexpired hold for this event and recording consent was
 * given. Metadata carries the identifiers the webhook needs to turn the order into a ticket.
 */
export async function createLiveTicketCheckout(
  event: LiveEventRow,
  buyer: LiveCheckoutBuyer,
  reservation: LiveReservation,
  client: LivePolarCheckoutsClient,
  locale: "en" | "vi" | undefined,
  deps: LiveCheckoutDeps
): Promise<{ url: string; checkoutId: string }> {
  const now = deps.now ?? new Date();
  if (event.status !== "sales_open" || !event.polarProductId) {
    throw new LiveError(409, "sales_not_open", "Ticket sales are not open for this event");
  }
  if (
    reservation.eventId !== event.id ||
    reservation.userId !== buyer.id ||
    reservation.status !== "held" ||
    reservation.expiresAt.getTime() <= now.getTime()
  ) {
    throw new LiveError(409, "reservation_invalid", "Your seat hold has expired; please start again");
  }
  if (!reservation.recordingConsentAt) throw new LiveRecordingConsentRequiredError();
  if (!buyer.email) throw new LiveError(400, "invalid_input", "Buyer email is required");

  const discountId = await resolveMemberDiscountId(event, buyer.id, deps.db, now);
  const successUrl = `${env.NEXT_PUBLIC_APP_URL}${liveEventPath(event.slug, locale)}?payment=success&session_id={CHECKOUT_ID}`;

  let checkout: { id: string; url: string } | undefined;
  try {
    const created = await client.checkouts.create({
      products: [event.polarProductId],
      successUrl,
      customerEmail: buyer.email,
      ...(discountId ? { discountId } : {}),
      metadata: {
        kind: LIVE_TICKET_PRODUCT_KIND,
        eventId: event.id,
        reservationId: reservation.id,
        userId: buyer.id,
        productSlug: event.slug,
      },
    });
    checkout = created.url ? { id: created.id, url: created.url } : undefined;
  } catch (error) {
    const statusCode =
      error && typeof error === "object" && "statusCode" in error ? (error as { statusCode: unknown }).statusCode : undefined;
    console.error("Polar checkout creation failed for live ticket:", {
      eventId: event.id,
      statusCode,
      error: error instanceof Error ? error.message : error,
    });
    throw new LiveError(502, "checkout_failed", "Unable to create checkout session. Please try again or contact support.");
  }
  if (!checkout) {
    console.error("Polar checkout created without a URL for live event:", event.id);
    throw new LiveError(502, "checkout_failed", "Unable to create checkout session. Please try again or contact support.");
  }

  await deps.db
    .update(liveTicketReservations)
    .set({ polarCheckoutId: checkout.id, updatedAt: now })
    .where(and(eq(liveTicketReservations.id, reservation.id), eq(liveTicketReservations.status, "held")));
  return { url: checkout.url, checkoutId: checkout.id };
}
