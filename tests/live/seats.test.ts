import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { liveSeats, liveTicketReservations } from "@/lib/db/schema";
import { LIVE_SEAT_HOLD_MS } from "@/lib/live/types";
import { holdSeat, releaseExpiredHolds } from "@/lib/live/seats";
import { LiveRecordingConsentRequiredError } from "@/lib/live/live-errors";
import { getPublicEventBySlug } from "@/lib/live/event-read-models";
import { seedDraftEvent, seedOnSaleEvent, seedUser } from "./live-fixtures";

const NOW = new Date(Date.UTC(2029, 5, 1, 3, 0));

async function seats(eventId: string) {
  return getDb().select().from(liveSeats).where(eq(liveSeats.eventId, eventId));
}

describe("seat holds", () => {
  it("never holds more seats than capacity under 50 concurrent checkouts", async () => {
    const event = await seedOnSaleEvent({ capacity: 10 });
    const buyers = await Promise.all(Array.from({ length: 50 }, () => seedUser("rush")));
    const results = await Promise.allSettled(
      buyers.map((b) => holdSeat({ eventId: event.id, userId: b.id, now: NOW, recordingConsent: true }, getDb()))
    );
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(10);
    expect(lost).toHaveLength(40);
    for (const r of lost) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "sold_out" });

    const held = (await seats(event.id)).filter((s) => s.state === "held");
    expect(held).toHaveLength(10);
    expect(new Set(held.map((s) => s.holderUserId)).size).toBe(10);
    expect(new Set(held.map((s) => s.reservationId)).size).toBe(10);
    const reservations = await getDb().select().from(liveTicketReservations).where(eq(liveTicketReservations.eventId, event.id));
    expect(reservations).toHaveLength(10);
    expect(new Set(reservations.map((r) => r.seatNo)).size).toBe(10);
    // 50 parallel round trips against one in-memory D1 can be slow on a loaded runner.
  }, 180_000);

  it("returns the existing hold instead of a second seat, even when requested concurrently", async () => {
    const event = await seedOnSaleEvent({ capacity: 5 });
    const buyer = await seedUser("dup");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => holdSeat({ eventId: event.id, userId: buyer.id, now: NOW, recordingConsent: true }, getDb()))
    );
    expect(new Set(results.map((r) => r.reservation.id)).size).toBe(1);
    expect((await seats(event.id)).filter((s) => s.state === "held")).toHaveLength(1);
    const again = await holdSeat({ eventId: event.id, userId: buyer.id, now: NOW, recordingConsent: true }, getDb());
    expect(again.created).toBe(false);
  });

  it("lets expired holds be reclaimed and released", async () => {
    const event = await seedOnSaleEvent({ capacity: 1 });
    const [first, second] = [await seedUser("a"), await seedUser("b")];
    const hold = await holdSeat({ eventId: event.id, userId: first.id, now: NOW, recordingConsent: true }, getDb());
    await expect(holdSeat({ eventId: event.id, userId: second.id, now: NOW, recordingConsent: true }, getDb())).rejects.toMatchObject({
      code: "sold_out",
    });
    expect((await getPublicEventBySlug(getDb(), event.slug, NOW))?.seatsLeft).toBe(0);

    const later = new Date(NOW.getTime() + LIVE_SEAT_HOLD_MS);
    expect((await getPublicEventBySlug(getDb(), event.slug, later))?.seatsLeft).toBe(1);
    const reclaimed = await holdSeat({ eventId: event.id, userId: second.id, now: later, recordingConsent: true }, getDb());
    expect(reclaimed.created).toBe(true);
    expect(reclaimed.reservation.seatNo).toBe(hold.reservation.seatNo);
    const [old] = await getDb().select().from(liveTicketReservations).where(eq(liveTicketReservations.id, hold.reservation.id));
    expect(old.status).toBe("expired");

    const muchLater = new Date(later.getTime() + LIVE_SEAT_HOLD_MS);
    expect(await releaseExpiredHolds(getDb(), muchLater, event.id)).toEqual({ seatsReleased: 1 });
    const [seat] = await getDb().select().from(liveSeats).where(and(eq(liveSeats.eventId, event.id), eq(liveSeats.seatNo, 1)));
    expect(seat).toMatchObject({ state: "free", holderUserId: null, reservationId: null });
  });

  it("requires recording consent and open sales", async () => {
    const onSale = await seedOnSaleEvent();
    const draft = await seedDraftEvent();
    const buyer = await seedUser("c");
    await expect(holdSeat({ eventId: onSale.id, userId: buyer.id, now: NOW, recordingConsent: false }, getDb())).rejects.toBeInstanceOf(
      LiveRecordingConsentRequiredError
    );
    await expect(holdSeat({ eventId: draft.id, userId: buyer.id, now: NOW, recordingConsent: true }, getDb())).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
