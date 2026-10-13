import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { customers, subscriptions } from "@/lib/db/schema";
import { computeSeatAvailability, getMembershipSeatAvailability } from "@/lib/home/membership-seats";
import { planForProductId, type MembershipProductIds } from "@/lib/home/membership-product-ids";
import { MEMBERSHIP_SEAT_CAPS } from "@/lib/constants/launch";

const IDS: MembershipProductIds = {
  premium: { quarterly: "prod-premium-q", annual: "prod-premium-a" },
  vip: { quarterly: "prod-vip-q", annual: "prod-vip-a" },
};

let seq = 0;
async function subscribe(productId: string, status: string, customerId?: string) {
  const db = getDb();
  const id = customerId ?? `cust-${++seq}`;
  if (!customerId) await db.insert(customers).values({ id, email: `${id}@example.test`, name: `Member ${seq}` });
  await db.insert(subscriptions).values({
    customerId: id,
    polarSubscriptionId: `sub-${++seq}`,
    polarProductId: productId,
    productName: productId,
    status,
  });
  return id;
}

describe("computeSeatAvailability", () => {
  it("subtracts real member counts from the plan caps", () => {
    expect(computeSeatAvailability({ premium: 23, vip: 8 })).toEqual({
      premium: { total: 30, taken: 23, left: 7, soldOut: false },
      vip: { total: 10, taken: 8, left: 2, soldOut: false },
    });
  });

  it("uses the configured caps of 30 Premium and 10 VIP", () => {
    expect(MEMBERSHIP_SEAT_CAPS).toEqual({ premium: 30, vip: 10 });
  });

  it("never goes negative when members exceed the cap", () => {
    const seats = computeSeatAvailability({ premium: 45, vip: 10 });
    expect(seats.premium).toEqual({ total: 30, taken: 30, left: 0, soldOut: true });
    expect(seats.vip.left).toBe(0);
    expect(seats.vip.soldOut).toBe(true);
  });

  it("treats missing, negative or invalid counts as zero members", () => {
    const seats = computeSeatAvailability({ premium: -3, vip: Number.NaN });
    expect(seats.premium.left).toBe(30);
    expect(seats.vip.left).toBe(10);
    expect(computeSeatAvailability({}).premium.taken).toBe(0);
  });
});

describe("planForProductId", () => {
  it("maps both billing cycles to their plan and ignores other products", () => {
    expect(planForProductId("prod-premium-a", IDS)).toBe("premium");
    expect(planForProductId("prod-vip-q", IDS)).toBe("vip");
    expect(planForProductId("prod-toolkit", IDS)).toBeNull();
  });
});

describe("getMembershipSeatAvailability", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.delete(subscriptions);
    await db.delete(customers);
  });

  it("returns full caps when nobody has subscribed", async () => {
    const seats = await getMembershipSeatAvailability(IDS);
    expect(seats.premium.left).toBe(30);
    expect(seats.vip.left).toBe(10);
  });

  it("counts only active membership subscriptions, per distinct customer", async () => {
    await subscribe("prod-premium-q", "active");
    await subscribe("prod-premium-a", "active");
    const repeat = await subscribe("prod-vip-q", "active");
    await subscribe("prod-vip-a", "active", repeat); // same customer on two VIP products counts once
    await subscribe("prod-vip-q", "canceled");
    await subscribe("prod-premium-q", "past_due");
    await subscribe("prod-toolkit", "active");

    const seats = await getMembershipSeatAvailability(IDS);
    expect(seats.premium).toEqual({ total: 30, taken: 2, left: 28, soldOut: false });
    expect(seats.vip).toEqual({ total: 10, taken: 1, left: 9, soldOut: false });
  });
});
