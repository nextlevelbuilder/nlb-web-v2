import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { liveAttendance, liveAttendeeRegistrations, liveMeetings } from "@/lib/db/schema";
import { LIVE_JOIN_OPENS_BEFORE_MS } from "@/lib/live/types";
import { holdSeat } from "@/lib/live/seats";
import { syncLiveTicketFromOrder } from "@/lib/live/live-webhook-tickets";
import { getJoinAccess } from "@/lib/live/meetings/join-access";
import { cancelProviderRegistrants } from "@/lib/live/meetings/meeting-service";
import type { MeetingProvider } from "@/lib/live/meetings/meeting-provider";
import type { LiveEventRow } from "@/lib/live/events";
import { HOUR, TEST_ENCRYPTION_KEY, nextSeq, seedOnSaleEvent, seedUser } from "./live-fixtures";

function fakeProvider(available = true) {
  const provider: MeetingProvider = {
    name: "zoom",
    available,
    createMeeting: vi.fn(async () => ({ meetingId: "mtg-1" })),
    registerAttendee: vi.fn(async (_id: string, a: { email: string }) => ({ registrantId: `reg-${a.email}`, joinUrl: `https://zoom.us/w/1?tk=${a.email}` })),
    cancelRegistrant: vi.fn(async () => undefined),
  };
  return provider;
}

async function ticketHolder(event: LiveEventRow) {
  const buyer = await seedUser("attendee");
  const now = new Date(event.startsAt.getTime() - 48 * HOUR);
  const { reservation } = await holdSeat({ eventId: event.id, userId: buyer.id, now, recordingConsent: true }, getDb());
  const orderId = `ord-${nextSeq()}`;
  const paid = {
    type: "order.paid",
    data: { id: orderId, status: "paid", product_id: event.polarProductId ?? "", customer_email: buyer.email, metadata: { userId: buyer.id, reservationId: reservation.id } },
  };
  expect(await syncLiveTicketFromOrder(paid, getDb(), now)).toBe("ticketed");
  return { buyer, orderId, paid };
}

describe("join access", () => {
  it("answers too_early, open (registering lazily, once) and ended around the window", async () => {
    const event = await seedOnSaleEvent();
    const { buyer } = await ticketHolder(event);
    const provider = fakeProvider();
    const deps = { db: getDb(), provider, encryptionKey: TEST_ENCRYPTION_KEY };
    const opensAt = event.startsAt.getTime() - LIVE_JOIN_OPENS_BEFORE_MS;

    const early = await getJoinAccess({ eventId: event.id, userId: buyer.id, now: new Date(opensAt - 1) }, deps);
    expect(early).toMatchObject({ status: "too_early" });
    expect(early.joinUrl).toBeUndefined();
    expect(provider.registerAttendee).not.toHaveBeenCalled();

    const open = await getJoinAccess({ eventId: event.id, userId: buyer.id, now: new Date(opensAt) }, deps);
    expect(open).toMatchObject({ status: "open", joinUrl: `https://zoom.us/w/1?tk=${buyer.email}` });
    expect(open.opensAt.getTime()).toBe(opensAt);
    const again = await getJoinAccess({ eventId: event.id, userId: buyer.id, now: event.endsAt }, deps);
    expect(again.status).toBe("open");
    expect(provider.createMeeting).toHaveBeenCalledTimes(1);
    expect(provider.registerAttendee).toHaveBeenCalledTimes(1);

    const [reg] = await getDb().select().from(liveAttendeeRegistrations).where(eq(liveAttendeeRegistrations.userId, buyer.id));
    expect(reg.status).toBe("registered");
    expect(reg.joinUrlCiphertext).not.toContain("zoom.us");
    const attendance = await getDb().select().from(liveAttendance).where(and(eq(liveAttendance.eventId, event.id), eq(liveAttendance.userId, buyer.id)));
    expect(attendance).toHaveLength(1);

    const ended = await getJoinAccess({ eventId: event.id, userId: buyer.id, now: new Date(event.endsAt.getTime() + 1) }, deps);
    expect(ended).toMatchObject({ status: "ended" });
    expect(ended.joinUrl).toBeUndefined();
  });

  it("answers no_ticket for non-holders and after a refund, and cancels the registrant at the provider", async () => {
    const event = await seedOnSaleEvent();
    const stranger = await seedUser("stranger");
    const { buyer, paid } = await ticketHolder(event);
    const provider = fakeProvider();
    const deps = { db: getDb(), provider, encryptionKey: TEST_ENCRYPTION_KEY };
    const inWindow = new Date(event.startsAt.getTime());

    expect((await getJoinAccess({ eventId: event.id, userId: stranger.id, now: inWindow }, deps)).status).toBe("no_ticket");
    expect((await getJoinAccess({ eventId: event.id, userId: buyer.id, now: inWindow }, deps)).status).toBe("open");

    await syncLiveTicketFromOrder({ ...paid, type: "order.refunded", data: { ...paid.data, status: "refunded" } }, getDb(), inWindow);
    const after = await getJoinAccess({ eventId: event.id, userId: buyer.id, now: inWindow }, deps);
    expect(after).toMatchObject({ status: "no_ticket" });
    expect(after.joinUrl).toBeUndefined();

    expect(await cancelProviderRegistrants(deps, event.id)).toEqual({ cancelled: 1, failed: 0, unavailable: false });
    expect(provider.cancelRegistrant).toHaveBeenCalledWith("mtg-1", `reg-${buyer.email}`);
    expect(await cancelProviderRegistrants(deps, event.id)).toEqual({ cancelled: 0, failed: 0, unavailable: false });
  });

  it("is not_ready when the provider is unavailable or failing", async () => {
    const event = await seedOnSaleEvent();
    const { buyer } = await ticketHolder(event);
    const inWindow = new Date(event.startsAt.getTime());
    const offline = { db: getDb(), provider: fakeProvider(false), encryptionKey: TEST_ENCRYPTION_KEY };
    expect(await getJoinAccess({ eventId: event.id, userId: buyer.id, now: inWindow }, offline)).toMatchObject({ status: "not_ready" });
    expect(await getJoinAccess({ eventId: event.id, userId: buyer.id, now: inWindow }, { ...offline, provider: null })).toMatchObject({
      status: "not_ready",
    });

    const failing = fakeProvider();
    failing.registerAttendee = vi.fn(async () => {
      throw new Error("Zoom registration failed with HTTP 500");
    });
    const res = await getJoinAccess({ eventId: event.id, userId: buyer.id, now: inWindow }, { ...offline, provider: failing });
    expect(res).toMatchObject({ status: "not_ready" });
    const [reg] = await getDb().select().from(liveAttendeeRegistrations).where(eq(liveAttendeeRegistrations.userId, buyer.id));
    expect(reg).toMatchObject({ status: "failed", lastError: "Zoom registration failed with HTTP 500" });
    const meetings = await getDb().select().from(liveMeetings).where(eq(liveMeetings.eventId, event.id));
    expect(meetings).toHaveLength(1);
  });
});
