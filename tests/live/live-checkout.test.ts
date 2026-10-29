import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { liveTicketReservations } from "@/lib/db/schema";
import { LIVE_SEAT_HOLD_MS } from "@/lib/live/types";
import { holdSeat } from "@/lib/live/seats";
import { createLiveTicketCheckout, type LivePolarCheckoutsClient } from "@/lib/live/live-checkout";
import { ensureLiveTicketPolarProduct } from "@/lib/live/live-polar-product";
import { fakePolarProducts, seedDraftEvent, seedOnSaleEvent, seedUser } from "./live-fixtures";

const tierMock = vi.hoisted(() => vi.fn(async () => ({ tier: "none", validUntil: null, reason: "no_membership" })));
vi.mock("@/lib/membership/member-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/membership/member-access")>()),
  getMemberTier: tierMock,
}));

const NOW = new Date(Date.UTC(2029, 5, 1, 3, 0));

function checkoutClient() {
  const create = vi.fn(async () => ({ id: "chk-1", url: "https://polar.test/checkout/chk-1" }));
  return { client: { checkouts: { create } } as unknown as LivePolarCheckoutsClient, create };
}

describe("live ticket checkout", () => {
  it("binds the checkout to the buyer, reservation and event, and stores the checkout id", async () => {
    const event = await seedOnSaleEvent();
    const buyer = await seedUser("chk");
    const { reservation } = await holdSeat({ eventId: event.id, userId: buyer.id, now: NOW, recordingConsent: true }, getDb());
    const { client, create } = checkoutClient();

    const result = await createLiveTicketCheckout(event, buyer, reservation, client, "vi", { db: getDb(), now: NOW });
    expect(result).toEqual({ url: "https://polar.test/checkout/chk-1", checkoutId: "chk-1" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        products: [event.polarProductId],
        customerEmail: buyer.email,
        successUrl: expect.stringContaining(`/vi/live/${event.slug}?payment=success`),
        metadata: expect.objectContaining({ kind: "live_ticket", eventId: event.id, reservationId: reservation.id, userId: buyer.id }),
      })
    );
    expect((create.mock.calls[0] as unknown[])[0]).not.toHaveProperty("discountId");
    const [stored] = await getDb().select().from(liveTicketReservations).where(eq(liveTicketReservations.id, reservation.id));
    expect(stored.polarCheckoutId).toBe("chk-1");
  });

  it("refuses an expired or foreign reservation", async () => {
    const event = await seedOnSaleEvent();
    const [buyer, other] = [await seedUser("chk"), await seedUser("chk")];
    const { reservation } = await holdSeat({ eventId: event.id, userId: buyer.id, now: NOW, recordingConsent: true }, getDb());
    const { client, create } = checkoutClient();
    const later = new Date(NOW.getTime() + LIVE_SEAT_HOLD_MS);
    await expect(createLiveTicketCheckout(event, buyer, reservation, client, "en", { db: getDb(), now: later })).rejects.toMatchObject({
      code: "reservation_invalid",
    });
    await expect(createLiveTicketCheckout(event, other, reservation, client, "en", { db: getDb(), now: NOW })).rejects.toMatchObject({
      code: "reservation_invalid",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("applies the discount configured for the buyer's tier, and none without membership", async () => {
    const event = { ...(await seedOnSaleEvent()), vipDiscountId: "disc-vip", premiumDiscountId: "disc-prem" };
    for (const [tier, expected] of [["vip", "disc-vip"], ["premium", "disc-prem"], ["none", undefined]] as const) {
      tierMock.mockResolvedValueOnce({ tier, validUntil: null, reason: "no_membership" });
      const buyer = await seedUser(`tier-${tier}`);
      const { reservation } = await holdSeat({ eventId: event.id, userId: buyer.id, now: NOW, recordingConsent: true }, getDb());
      const { client, create } = checkoutClient();
      await createLiveTicketCheckout(event, buyer, reservation, client, "en", { db: getDb(), now: NOW });
      const args = (create.mock.calls[0] as unknown[])[0] as { discountId?: string };
      expect(args.discountId).toBe(expected);
    }
  });
});

describe("live ticket Polar product", () => {
  it("creates one fixed-price product with live_ticket metadata and is idempotent", async () => {
    const draft = await seedDraftEvent({ priceCents: 2500 });
    const create = vi.fn(async () => ({ id: "polar-live-x" }));
    const client = { products: { create, update: vi.fn() } } as unknown as Parameters<typeof ensureLiveTicketPolarProduct>[2];
    expect(await ensureLiveTicketPolarProduct(draft, getDb(), client)).toBe("polar-live-x");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        recurringInterval: null,
        prices: [{ amountType: "fixed", priceAmount: 2500, priceCurrency: "usd" }],
        metadata: expect.objectContaining({ kind: "live_ticket", eventId: draft.id }),
      })
    );
    expect(await ensureLiveTicketPolarProduct({ ...draft, polarProductId: "polar-live-x" }, getDb(), fakePolarProducts("other"))).toBe("polar-live-x");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
