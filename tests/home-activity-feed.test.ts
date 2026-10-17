import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { customers, subscriptions } from "@/lib/db/schema";
import { getRecentMembershipActivity, toFirstName } from "@/lib/home/recent-membership-activity";
import type { MembershipProductIds } from "@/lib/home/membership-product-ids";

const IDS: MembershipProductIds = {
  premium: { quarterly: "prod-premium-q", annual: "prod-premium-a" },
  vip: { quarterly: "prod-vip-q", annual: "prod-vip-a" },
};
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
async function join(name: string | null, productId: string, createdAt: number, status = "active") {
  const db = getDb();
  const id = `cust-${++seq}`;
  await db.insert(customers).values({ id, email: `secret-${seq}@example.test`, name });
  await db.insert(subscriptions).values({
    customerId: id, polarSubscriptionId: `sub-${seq}`, polarProductId: productId, productName: productId,
    status, createdAt: new Date(createdAt), updatedAt: new Date(createdAt),
  });
}

describe("toFirstName", () => {
  it("keeps only the first name", () => {
    expect(toFirstName("Nguyễn Minh")).toBe("Nguyễn");
    expect(toFirstName("  lan tran ")).toBe("Lan");
  });

  it("never exposes emails or symbol-only names", () => {
    expect(toFirstName("minh@example.com")).toBeNull();
    expect(toFirstName("1234 !!")).toBeNull();
    expect(toFirstName("")).toBeNull();
    expect(toFirstName(null)).toBeNull();
  });

  it("strips markup and caps the length", () => {
    expect(toFirstName("<b>Tuấn</b>")).toBe("BTuấnb");
    expect(toFirstName("A".repeat(60))?.length).toBe(24);
  });
});

describe("getRecentMembershipActivity", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.delete(subscriptions);
    await db.delete(customers);
  });

  it("returns an empty list when no events exist", async () => {
    await expect(getRecentMembershipActivity(IDS, { now: NOW })).resolves.toEqual([]);
  });

  it("returns an empty list when the only events are old, inactive or not memberships", async () => {
    await join("Old", "prod-vip-q", NOW - 30 * DAY);
    await join("Gone", "prod-vip-q", NOW - DAY, "canceled");
    await join("Tool", "prod-toolkit", NOW - DAY);
    await expect(getRecentMembershipActivity(IDS, { now: NOW, windowDays: 14 })).resolves.toEqual([]);
  });

  it("lists real recent joins newest first with first names only", async () => {
    await join("Minh Nguyen", "prod-vip-q", NOW - 2 * DAY);
    await join("Lan Tran", "prod-premium-a", NOW - 60 * 60 * 1000);
    await join(null, "prod-premium-q", NOW - 3 * DAY);

    const activity = await getRecentMembershipActivity(IDS, { now: NOW });
    expect(activity.map(({ firstName, plan, occurredAt }) => ({ firstName, plan, occurredAt }))).toEqual([
      { firstName: "Lan", plan: "premium", occurredAt: NOW - 60 * 60 * 1000 },
      { firstName: "Minh", plan: "vip", occurredAt: NOW - 2 * DAY },
      { firstName: null, plan: "premium", occurredAt: NOW - 3 * DAY },
    ]);
    expect(JSON.stringify(activity)).not.toContain("example.test");
  });

  it("respects the item limit", async () => {
    for (let i = 0; i < 5; i++) await join(`Member${i}`, "prod-vip-q", NOW - i * 1000);
    await expect(getRecentMembershipActivity(IDS, { now: NOW, limit: 2 })).resolves.toHaveLength(2);
  });
});
