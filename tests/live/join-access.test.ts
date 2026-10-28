import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { liveAttendance, liveAttendeeRegistrations, liveMeetings } from "@/lib/db/schema";
import { LIVE_JOIN_OPENS_BEFORE_MS } from "@/lib/live/types";
import { holdSeat } from "@/lib/live/seats";
import { syncLiveTicketFromOrder } from "@/lib/live/live-webhook-tickets";
import { getJoinAccess } from "@/lib/live/meetings/join-access";
import { cancelProviderRegistrants, cancelRetryDelayMs } from "@/lib/live/meetings/meeting-service";
import { MeetingProviderError, MeetingProviderNotFoundError, type MeetingProvider } from "@/lib/live/meetings/meeting-provider";
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

/** The provider meeting an operator creates through the operator route before joins open. */
async function seedMeeting(event: LiveEventRow) {
  await getDb().insert(liveMeetings).values({ eventId: event.id, provider: "zoom", providerMeetingId: "mtg-1" });
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
    await seedMeeting(event);
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
    expect(provider.createMeeting).not.toHaveBeenCalled();
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
    await seedMeeting(event);
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

    expect(await cancelProviderRegistrants(deps, event.id)).toEqual({ cancelled: 1, failed: 0, abandoned: 0, unavailable: false });
    expect(provider.cancelRegistrant).toHaveBeenCalledWith("mtg-1", `reg-${buyer.email}`);
    expect(await cancelProviderRegistrants(deps, event.id)).toEqual({ cancelled: 0, failed: 0, abandoned: 0, unavailable: false });
  });

  it("answers meeting_not_ready without creating a meeting until an operator has created one", async () => {
    const event = await seedOnSaleEvent();
    const holders = [await ticketHolder(event), await ticketHolder(event), await ticketHolder(event)];
    const provider = fakeProvider();
    const deps = { db: getDb(), provider, encryptionKey: TEST_ENCRYPTION_KEY };
    const inWindow = new Date(event.startsAt.getTime());

    const burst = await Promise.all(holders.map(({ buyer }) => getJoinAccess({ eventId: event.id, userId: buyer.id, now: inWindow }, deps)));
    expect(burst.map((access) => access.status)).toEqual(["meeting_not_ready", "meeting_not_ready", "meeting_not_ready"]);
    expect(burst.every((access) => access.joinUrl === undefined)).toBe(true);
    expect(provider.createMeeting).not.toHaveBeenCalled();
    expect(provider.registerAttendee).not.toHaveBeenCalled();
    expect(await getDb().select().from(liveMeetings).where(eq(liveMeetings.eventId, event.id))).toHaveLength(0);

    await seedMeeting(event);
    expect(await getJoinAccess({ eventId: event.id, userId: holders[0].buyer.id, now: inWindow }, deps)).toMatchObject({ status: "open" });
    expect(provider.createMeeting).not.toHaveBeenCalled();
  });

  it("is not_ready when the provider is unavailable or failing", async () => {
    const event = await seedOnSaleEvent();
    await seedMeeting(event);
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

describe("registrant cancellation sweep", () => {
  /** A ticket holder registered at the provider, then refunded, so the provider cancel is pending. */
  async function revokedRegistrant(event: LiveEventRow) {
    const { buyer, paid } = await ticketHolder(event);
    const inWindow = new Date(event.startsAt.getTime());
    const deps = { db: getDb(), provider: fakeProvider(), encryptionKey: TEST_ENCRYPTION_KEY };
    expect((await getJoinAccess({ eventId: event.id, userId: buyer.id, now: inWindow }, deps)).status).toBe("open");
    await syncLiveTicketFromOrder({ ...paid, type: "order.refunded", data: { ...paid.data, status: "refunded" } }, getDb(), inWindow);
    return buyer;
  }
  const registration = async (eventId: string, userId: string) =>
    (await getDb().select().from(liveAttendeeRegistrations).where(and(eq(liveAttendeeRegistrations.eventId, eventId), eq(liveAttendeeRegistrations.userId, userId))))[0];

  it("backs off 1, 2, 4 … minutes, capped at an hour", () => {
    expect([1, 2, 3, 4, 6, 7, 20].map((n) => cancelRetryDelayMs(n) / 60_000)).toEqual([1, 2, 4, 8, 32, 60, 60]);
  });

  it("treats a provider 404 as already cancelled", async () => {
    const event = await seedOnSaleEvent();
    await seedMeeting(event);
    const buyer = await revokedRegistrant(event);
    const provider = fakeProvider();
    provider.cancelRegistrant = vi.fn(async () => {
      throw new MeetingProviderNotFoundError("zoom", "Zoom registrant cancellation failed with HTTP 404");
    });
    const result = await cancelProviderRegistrants({ db: getDb(), provider }, event.id, event.startsAt);
    expect(result).toEqual({ cancelled: 1, failed: 0, abandoned: 0, unavailable: false });
    expect(await registration(event.id, buyer.id)).toMatchObject({ status: "cancelled", providerRegistrantId: null, lastError: null });
  });

  it("retries a failing cancel only when due, then abandons it once the event has ended", async () => {
    const event = await seedOnSaleEvent();
    await seedMeeting(event);
    const buyer = await revokedRegistrant(event);
    const provider = fakeProvider();
    provider.cancelRegistrant = vi.fn(async () => {
      throw new MeetingProviderError("zoom", 500, "Zoom registrant cancellation failed with HTTP 500");
    });
    const deps = { db: getDb(), provider };
    const t0 = event.startsAt.getTime();
    const sweep = (at: number) => cancelProviderRegistrants(deps, event.id, new Date(at));

    expect(await sweep(t0)).toMatchObject({ cancelled: 0, failed: 1, abandoned: 0 });
    expect(await registration(event.id, buyer.id)).toMatchObject({ cancelAttempts: 1, nextCancelAttemptAt: new Date(t0 + 60_000) });
    // Not due yet: the row is skipped and the provider is not called again.
    expect(await sweep(t0 + 30_000)).toMatchObject({ cancelled: 0, failed: 0, abandoned: 0 });
    expect(provider.cancelRegistrant).toHaveBeenCalledTimes(1);
    expect(await sweep(t0 + 60_000)).toMatchObject({ failed: 1 });
    expect(await registration(event.id, buyer.id)).toMatchObject({ cancelAttempts: 2, nextCancelAttemptAt: new Date(t0 + 60_000 + 120_000) });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ended = event.endsAt.getTime() + 1;
    expect(await sweep(ended)).toMatchObject({ cancelled: 0, failed: 0, abandoned: 1 });
    expect(await registration(event.id, buyer.id)).toMatchObject({ status: "cancel_abandoned", cancelAttempts: 3, nextCancelAttemptAt: null });
    expect(warn).toHaveBeenCalledTimes(1);
    // Terminal: later sweeps never pick it up again.
    expect(await sweep(ended + 2 * HOUR)).toEqual({ cancelled: 0, failed: 0, abandoned: 0, unavailable: false });
    expect(provider.cancelRegistrant).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
