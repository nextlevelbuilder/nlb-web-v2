import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { entitlements, liveAttendeeRegistrations, liveSeats, liveTicketReservations, liveTickets } from "@/lib/db/schema";
import { LIVE_SEAT_HOLD_MS, liveTicketFeatureKey } from "@/lib/live/types";
import { holdSeat } from "@/lib/live/seats";
import { hasLiveTicketProduct, syncLiveTicketFromOrder } from "@/lib/live/live-webhook-tickets";
import { cancelEvent } from "@/lib/live/event-cancellation";
import type { LiveEventRow } from "@/lib/live/events";
import { nextSeq, seedOnSaleEvent, seedUser } from "./live-fixtures";

vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: vi.fn().mockReturnValue(true),
  WebhookVerificationError: class WebhookVerificationError extends Error {},
}));
vi.mock("@/lib/resend", () => ({ sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true, data: {} }) }));
vi.mock("@/lib/email-form01", () => ({ sendForm01Email: vi.fn().mockResolvedValue({ success: true, data: {} }) }));
vi.mock("@/lib/discord", () => ({ sendDiscordSalesNotification: vi.fn().mockResolvedValue(true) }));

const { POST } = await import("@/app/api/webhooks/polar/route");

const NOW = new Date(Date.UTC(2029, 5, 1, 3, 0));

function deliver(event: Record<string, unknown>, webhookId: string) {
  return POST(
    new Request("https://nlb.test/api/webhooks/polar", {
      method: "POST",
      headers: { "webhook-id": webhookId, "webhook-timestamp": "1700000000", "webhook-signature": "v1,dummy" },
      body: JSON.stringify(event),
    })
  );
}

function order(type: string, event: LiveEventRow, extra: { id: string; status: string; email: string; userId?: string; reservationId?: string }) {
  return {
    type,
    data: {
      id: extra.id,
      status: extra.status,
      paid: extra.status === "paid",
      product_id: event.polarProductId ?? undefined,
      customer_email: extra.email,
      total_amount: event.priceCents,
      currency: "usd",
      metadata: { kind: "live_ticket", eventId: event.id, userId: extra.userId, reservationId: extra.reservationId },
    },
  };
}

async function entitlementOf(userId: string, eventId: string) {
  const [row] = await getDb()
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.featureKey, liveTicketFeatureKey(eventId))));
  return row;
}

async function heldBuyer(event: LiveEventRow, now = NOW) {
  const buyer = await seedUser("buyer");
  const { reservation } = await holdSeat({ eventId: event.id, userId: buyer.id, now, recordingConsent: true }, getDb());
  return { buyer, reservation };
}

describe("Polar webhook: live tickets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("treats live products as ours and turns duplicate paid deliveries into one ticket and one grant", async () => {
    const event = await seedOnSaleEvent({ capacity: 3 });
    expect(await hasLiveTicketProduct([event.polarProductId as string], getDb())).toBe(true);
    const { buyer, reservation } = await heldBuyer(event, new Date());
    const paid = order("order.paid", event, { id: `ord-${nextSeq()}`, status: "paid", email: buyer.email, userId: buyer.id, reservationId: reservation.id });

    const res = await deliver(paid, `wh-live-paid-${paid.data.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect((await deliver({ ...paid, type: "order.updated" }, `wh-live-upd-${paid.data.id}`)).status).toBe(200);
    expect((await deliver(paid, `wh-live-paid2-${paid.data.id}`)).status).toBe(200);

    const tickets = await getDb().select().from(liveTickets).where(eq(liveTickets.polarOrderId, paid.data.id));
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ status: "active", userId: buyer.id, seatNo: reservation.seatNo, reservationId: reservation.id });
    expect(tickets[0].recordingConsentAt).toBeInstanceOf(Date);
    const grants = await getDb().select().from(entitlements).where(eq(entitlements.userId, buyer.id));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ isActive: true, featureKey: liveTicketFeatureKey(event.id) });
    const [seat] = await getDb().select().from(liveSeats).where(and(eq(liveSeats.eventId, event.id), eq(liveSeats.seatNo, reservation.seatNo)));
    expect(seat).toMatchObject({ state: "ticketed", ticketId: tickets[0].id, expiresAt: null });
    const [res2] = await getDb().select().from(liveTicketReservations).where(eq(liveTicketReservations.id, reservation.id));
    expect(res2.status).toBe("converted");
  });

  it("a refund that arrives before paid stays refunded and never grants access", async () => {
    const event = await seedOnSaleEvent({ capacity: 2 });
    const { buyer, reservation } = await heldBuyer(event);
    const base = { id: `ord-${nextSeq()}`, email: buyer.email, userId: buyer.id, reservationId: reservation.id };

    expect(await syncLiveTicketFromOrder(order("order.refunded", event, { ...base, status: "refunded" }), getDb(), NOW)).toBe("refunded");
    expect(await syncLiveTicketFromOrder(order("order.paid", event, { ...base, status: "paid" }), getDb(), NOW)).toBe("duplicate");

    const [ticket] = await getDb().select().from(liveTickets).where(eq(liveTickets.polarOrderId, base.id));
    expect(ticket.status).toBe("refunded");
    expect(await entitlementOf(buyer.id, event.id)).toBeUndefined();
    const ticketed = (await getDb().select().from(liveSeats).where(eq(liveSeats.eventId, event.id))).filter((s) => s.state === "ticketed");
    expect(ticketed).toHaveLength(0);
  });

  it("a full refund revokes; a partial refund keeps the ticket", async () => {
    const event = await seedOnSaleEvent({ capacity: 2 });
    const { buyer, reservation } = await heldBuyer(event);
    const base = { id: `ord-${nextSeq()}`, email: buyer.email, userId: buyer.id, reservationId: reservation.id };
    expect(await syncLiveTicketFromOrder(order("order.paid", event, { ...base, status: "paid" }), getDb(), NOW)).toBe("ticketed");
    await getDb().insert(liveAttendeeRegistrations).values({ eventId: event.id, userId: buyer.id, ticketId: (await getDb().select().from(liveTickets).where(eq(liveTickets.polarOrderId, base.id)))[0].id, status: "registered", providerRegistrantId: "reg-1", joinUrlCiphertext: "v1.x.y" });

    expect(await syncLiveTicketFromOrder(order("order.refunded", event, { ...base, status: "partially_refunded" }), getDb(), NOW)).toBe("ignored");
    expect((await entitlementOf(buyer.id, event.id))?.isActive).toBe(true);

    expect(await syncLiveTicketFromOrder(order("order.refunded", event, { ...base, status: "refunded" }), getDb(), NOW)).toBe("refunded");
    const [ticket] = await getDb().select().from(liveTickets).where(eq(liveTickets.polarOrderId, base.id));
    expect(ticket.status).toBe("refunded");
    expect((await entitlementOf(buyer.id, event.id))?.isActive).toBe(false);
    const [seat] = await getDb().select().from(liveSeats).where(and(eq(liveSeats.eventId, event.id), eq(liveSeats.seatNo, reservation.seatNo)));
    expect(seat).toMatchObject({ state: "free", ticketId: null });
    const [reg] = await getDb().select().from(liveAttendeeRegistrations).where(eq(liveAttendeeRegistrations.eventId, event.id));
    expect(reg).toMatchObject({ status: "cancelled", joinUrlCiphertext: null, providerRegistrantId: "reg-1" });
    // A late paid redelivery never re-grants.
    expect(await syncLiveTicketFromOrder(order("order.paid", event, { ...base, status: "paid" }), getDb(), NOW)).toBe("duplicate");
    expect((await entitlementOf(buyer.id, event.id))?.isActive).toBe(false);
  });

  it("paid after the hold expired takes another free seat, or becomes an exception when sold out", async () => {
    const event = await seedOnSaleEvent({ capacity: 1 });
    const { buyer: late, reservation } = await heldBuyer(event);
    const later = new Date(NOW.getTime() + LIVE_SEAT_HOLD_MS + 1);
    const { buyer: winner, reservation: winnerHold } = await heldBuyer(event, later);
    expect(winnerHold.seatNo).toBe(reservation.seatNo);
    await syncLiveTicketFromOrder(
      order("order.paid", event, { id: `ord-${nextSeq()}`, status: "paid", email: winner.email, userId: winner.id, reservationId: winnerHold.id }),
      getDb(),
      later
    );

    const lateOrder = `ord-${nextSeq()}`;
    const outcome = await syncLiveTicketFromOrder(
      order("order.paid", event, { id: lateOrder, status: "paid", email: late.email, userId: late.id, reservationId: reservation.id }),
      getDb(),
      later
    );
    expect(outcome).toBe("exception");
    const [ticket] = await getDb().select().from(liveTickets).where(eq(liveTickets.polarOrderId, lateOrder));
    expect(ticket).toMatchObject({ status: "exception", exceptionReason: "sold_out", seatNo: null });
    expect(await entitlementOf(late.id, event.id)).toBeUndefined();
    const seats = await getDb().select().from(liveSeats).where(eq(liveSeats.eventId, event.id));
    expect(seats.filter((s) => s.state === "ticketed")).toHaveLength(1);
  });

  it("paid after hold expiry with seats left claims a free seat", async () => {
    const event = await seedOnSaleEvent({ capacity: 2 });
    const { buyer, reservation } = await heldBuyer(event);
    const later = new Date(NOW.getTime() + LIVE_SEAT_HOLD_MS + 1);
    await heldBuyer(event, later); // takes the expired seat 1
    const outcome = await syncLiveTicketFromOrder(
      order("order.paid", event, { id: `ord-${nextSeq()}`, status: "paid", email: buyer.email, userId: buyer.id, reservationId: reservation.id }),
      getDb(),
      later
    );
    expect(outcome).toBe("ticketed");
    expect((await entitlementOf(buyer.id, event.id))?.isActive).toBe(true);
  });

  it("does not give a second seat to a buyer who already holds a ticket", async () => {
    const event = await seedOnSaleEvent({ capacity: 3 });
    const { buyer, reservation } = await heldBuyer(event);
    const first = { id: `ord-${nextSeq()}`, status: "paid", email: buyer.email, userId: buyer.id, reservationId: reservation.id };
    expect(await syncLiveTicketFromOrder(order("order.paid", event, first), getDb(), NOW)).toBe("ticketed");
    const second = { ...first, id: `ord-${nextSeq()}` };
    expect(await syncLiveTicketFromOrder(order("order.paid", event, second), getDb(), NOW)).toBe("exception");
    const [ticket] = await getDb().select().from(liveTickets).where(eq(liveTickets.polarOrderId, second.id));
    expect(ticket).toMatchObject({ status: "exception", exceptionReason: "duplicate_purchase" });
    const seats = await getDb().select().from(liveSeats).where(eq(liveSeats.eventId, event.id));
    expect(seats.filter((s) => s.state === "ticketed")).toHaveLength(1);
  });

  it("stores a paid order with no account as an exception", async () => {
    const event = await seedOnSaleEvent({ capacity: 2 });
    const id = `ord-${nextSeq()}`;
    const outcome = await syncLiveTicketFromOrder(order("order.paid", event, { id, status: "paid", email: "nobody@example.com" }), getDb(), NOW);
    expect(outcome).toBe("exception");
    const [ticket] = await getDb().select().from(liveTickets).where(eq(liveTickets.polarOrderId, id));
    expect(ticket).toMatchObject({ status: "exception", exceptionReason: "no_account", userId: null });
  });

  it("cancelling the event revokes tickets, entitlements, holds and seats", async () => {
    const event = await seedOnSaleEvent({ capacity: 3 });
    const { buyer, reservation } = await heldBuyer(event);
    await syncLiveTicketFromOrder(
      order("order.paid", event, { id: `ord-${nextSeq()}`, status: "paid", email: buyer.email, userId: buyer.id, reservationId: reservation.id }),
      getDb(),
      NOW
    );
    const { reservation: pending } = await heldBuyer(event);

    const result = await cancelEvent(event.id, getDb(), { now: NOW });
    expect(result.ticketsRevoked).toBe(1);
    const [ticket] = await getDb().select().from(liveTickets).where(eq(liveTickets.eventId, event.id));
    expect(ticket.status).toBe("cancelled");
    expect((await entitlementOf(buyer.id, event.id))?.isActive).toBe(false);
    const [hold] = await getDb().select().from(liveTicketReservations).where(eq(liveTicketReservations.id, pending.id));
    expect(hold.status).toBe("released");
    const seats = await getDb().select().from(liveSeats).where(eq(liveSeats.eventId, event.id));
    expect(seats.every((s) => s.state === "free")).toBe(true);
    await expect(cancelEvent(event.id, getDb(), { now: NOW })).rejects.toMatchObject({ code: "invalid_transition" });
  });
});
