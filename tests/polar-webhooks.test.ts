import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orders } from "@/lib/db/schema";
import {
  PRODUCT_IDS,
  MEMBERSHIP_PRODUCT_IDS,
  DIRECTORY_PRODUCT_IDS,
  ALLOWED_PRODUCT_IDS,
  isMembershipProduct,
  isDirectoryProduct,
  isOurProduct,
} from "@/lib/polar";

// Mock Resend and Discord notifications. The database is the real local D1 from the test setup.
const sendWelcomeEmailMock = vi.fn().mockResolvedValue({ success: true, data: { id: "msg_welcome_123" } });
const sendForm01EmailMock = vi.fn().mockResolvedValue({ success: true, data: { id: "msg_form01_123" } });
const sendDiscordSalesMock = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/resend", () => ({
  sendWelcomeEmail: (...args: any[]) => sendWelcomeEmailMock(...args),
}));

vi.mock("@/lib/email-form01", () => ({
  sendForm01Email: (...args: any[]) => sendForm01EmailMock(...args),
}));

vi.mock("@/lib/discord", () => ({
  sendDiscordSalesNotification: (...args: any[]) => sendDiscordSalesMock(...args),
}));

// Mock Polar Webhook signature validation to pass during unit tests
vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: vi.fn().mockReturnValue(true),
  WebhookVerificationError: class WebhookVerificationError extends Error {},
}));

describe("Polar Product Classification & Single Source of Truth", () => {
  it("should maintain disjoint classification sets whose union equals ALLOWED_PRODUCT_IDS", () => {
    expect(MEMBERSHIP_PRODUCT_IDS.size).toBe(4);
    expect(DIRECTORY_PRODUCT_IDS.size).toBe(2);
    expect(ALLOWED_PRODUCT_IDS.size).toBe(6);

    // Disjoint assertion
    for (const id of MEMBERSHIP_PRODUCT_IDS) {
      expect(DIRECTORY_PRODUCT_IDS.has(id)).toBe(false);
    }

    // Full union assertion
    for (const id of MEMBERSHIP_PRODUCT_IDS) {
      expect(ALLOWED_PRODUCT_IDS.has(id)).toBe(true);
    }
    for (const id of DIRECTORY_PRODUCT_IDS) {
      expect(ALLOWED_PRODUCT_IDS.has(id)).toBe(true);
    }
  });

  it("should accurately classify membership vs directory product IDs", () => {
    // Membership
    expect(isMembershipProduct(PRODUCT_IDS.PREMIUM_QUARTERLY)).toBe(true);
    expect(isMembershipProduct(PRODUCT_IDS.PREMIUM_ANNUAL)).toBe(true);
    expect(isMembershipProduct(PRODUCT_IDS.VIP_QUARTERLY)).toBe(true);
    expect(isMembershipProduct(PRODUCT_IDS.VIP_ANNUAL)).toBe(true);
    expect(isMembershipProduct(PRODUCT_IDS.DIRECTORY_EARLY_BIRD)).toBe(false);
    expect(isMembershipProduct(PRODUCT_IDS.DIRECTORY_STANDARD)).toBe(false);
    expect(isMembershipProduct("random-external-id")).toBe(false);
    expect(isMembershipProduct(null)).toBe(false);
    expect(isMembershipProduct(undefined)).toBe(false);

    // Publishing Studio Toolkit
    expect(isDirectoryProduct(PRODUCT_IDS.DIRECTORY_EARLY_BIRD)).toBe(true);
    expect(isDirectoryProduct(PRODUCT_IDS.DIRECTORY_STANDARD)).toBe(true);
    expect(isMembershipProduct(PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD)).toBe(false);
    expect(isOurProduct(PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD)).toBe(true);
    expect(isDirectoryProduct(PRODUCT_IDS.PREMIUM_QUARTERLY)).toBe(false);
    expect(isDirectoryProduct(PRODUCT_IDS.PREMIUM_ANNUAL)).toBe(false);
    expect(isDirectoryProduct("random-external-id")).toBe(false);
    expect(isDirectoryProduct(null)).toBe(false);
    expect(isDirectoryProduct(undefined)).toBe(false);

    // Tenant allowlist
    expect(isOurProduct(PRODUCT_IDS.DIRECTORY_EARLY_BIRD)).toBe(true);
    expect(isOurProduct(PRODUCT_IDS.PREMIUM_QUARTERLY)).toBe(true);
    expect(isOurProduct("unknown-id")).toBe(false);
  });
});

describe("Polar Webhook Route: Email Isolation & Idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC1: Directory purchase should produce ZERO Welcome and ZERO Form 01 emails across all events", async () => {
    const { POST } = await import("@/app/api/webhooks/polar/route");

    // 1. checkout.updated for directory product
    const checkoutEvent = {
      type: "checkout.updated",
      id: "evt_chk_dir_1",
      data: {
        id: "chk_dir_1",
        status: "succeeded",
        customer_email: "builder@example.com",
        customer_name: "Indie Builder",
        product_id: PRODUCT_IDS.DIRECTORY_EARLY_BIRD,
      },
    };

    const res1 = await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: {
          "webhook-id": "wh_chk_dir_1",
          "webhook-timestamp": "1700000000",
          "webhook-signature": "v1,dummy",
        },
        body: JSON.stringify(checkoutEvent),
      })
    );
    expect(res1.status).toBe(200);

    // 2. order.created for directory product
    const orderCreatedEvent = {
      type: "order.created",
      id: "evt_ord_dir_1",
      data: {
        id: "ord_dir_1",
        status: "paid",
        paid: true,
        customer_email: "builder@example.com",
        customer_name: "Indie Builder",
        product_id: PRODUCT_IDS.DIRECTORY_EARLY_BIRD,
        amount: 2450,
      },
    };

    const res2 = await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: {
          "webhook-id": "wh_ord_dir_1",
          "webhook-timestamp": "1700000001",
          "webhook-signature": "v1,dummy",
        },
        body: JSON.stringify(orderCreatedEvent),
      })
    );
    expect(res2.status).toBe(200);

    // Assert zero onboarding emails dispatched for directory purchase
    expect(sendWelcomeEmailMock).toHaveBeenCalledTimes(0);
    expect(sendForm01EmailMock).toHaveBeenCalledTimes(0);
  });

  it("AC2: Membership purchase sequence should produce EXACTLY ONE Welcome and ONE Form 01 email across event fan-out", async () => {
    const { POST } = await import("@/app/api/webhooks/polar/route");

    // 1. checkout.updated for Premium Annual
    const checkoutEvent = {
      type: "checkout.updated",
      id: "evt_chk_mem_1",
      data: {
        id: "chk_mem_1",
        status: "succeeded",
        customer_email: "pro@example.com",
        customer_name: "Pro Builder",
        product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
      },
    };

    await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: {
          "webhook-id": "wh_chk_mem_1",
          "webhook-timestamp": "1700000000",
          "webhook-signature": "v1,dummy",
        },
        body: JSON.stringify(checkoutEvent),
      })
    );

    // checkout.updated must NOT send onboarding emails
    expect(sendWelcomeEmailMock).toHaveBeenCalledTimes(0);
    expect(sendForm01EmailMock).toHaveBeenCalledTimes(0);

    // 2. subscription.created for Premium Annual (active)
    const subCreatedEvent = {
      type: "subscription.created",
      id: "evt_sub_mem_1",
      data: {
        id: "sub_polar_123",
        status: "active",
        customer_email: "pro@example.com",
        customer_name: "Pro Builder",
        product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
      },
    };

    await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: {
          "webhook-id": "wh_sub_mem_1",
          "webhook-timestamp": "1700000001",
          "webhook-signature": "v1,dummy",
        },
        body: JSON.stringify(subCreatedEvent),
      })
    );

    // subscription.created triggers onboarding exactly once
    expect(sendWelcomeEmailMock).toHaveBeenCalledTimes(1);
    expect(sendForm01EmailMock).toHaveBeenCalledTimes(1);

    // 3. order.created (paid) for same purchase
    const orderCreatedEvent = {
      type: "order.created",
      id: "evt_ord_mem_1",
      data: {
        id: "ord_mem_1",
        status: "paid",
        paid: true,
        customer_email: "pro@example.com",
        customer_name: "Pro Builder",
        product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
        amount: 46800,
      },
    };

    await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: {
          "webhook-id": "wh_ord_mem_1",
          "webhook-timestamp": "1700000002",
          "webhook-signature": "v1,dummy",
        },
        body: JSON.stringify(orderCreatedEvent),
      })
    );

    // Still exactly 1 send total across the entire 3-event fan-out
    expect(sendWelcomeEmailMock).toHaveBeenCalledTimes(1);
    expect(sendForm01EmailMock).toHaveBeenCalledTimes(1);

    // 4. If subscription.created is replayed with a new webhook-id, subject-key idempotency suppresses it
    const subReplayEvent = {
      type: "subscription.created",
      id: "evt_sub_mem_replay",
      data: {
        id: "sub_polar_123", // Same subscription ID
        status: "active",
        customer_email: "pro@example.com",
        customer_name: "Pro Builder",
        product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
      },
    };

    await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: {
          "webhook-id": "wh_sub_mem_replay_id",
          "webhook-timestamp": "1700000003",
          "webhook-signature": "v1,dummy",
        },
        body: JSON.stringify(subReplayEvent),
      })
    );

    expect(sendWelcomeEmailMock).toHaveBeenCalledTimes(1);
    expect(sendForm01EmailMock).toHaveBeenCalledTimes(1);
  });

  it("AC3: Subscription renewal order should produce ZERO onboarding emails", async () => {
    const { POST } = await import("@/app/api/webhooks/polar/route");

    // Recurring subscription renewal order (paid)
    const renewalOrderEvent = {
      type: "order.paid",
      id: "evt_renewal_1",
      data: {
        id: "ord_renewal_999",
        status: "paid",
        paid: true,
        customer_email: "existing_member@example.com",
        customer_name: "Loyal Builder",
        product_id: PRODUCT_IDS.PREMIUM_QUARTERLY,
        amount: 14700,
      },
    };

    const res = await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: {
          "webhook-id": "wh_renewal_999",
          "webhook-timestamp": "1700009999",
          "webhook-signature": "v1,dummy",
        },
        body: JSON.stringify(renewalOrderEvent),
      })
    );

    expect(res.status).toBe(200);
    // Zero onboarding emails on subscription renewal orders
    expect(sendWelcomeEmailMock).toHaveBeenCalledTimes(0);
    expect(sendForm01EmailMock).toHaveBeenCalledTimes(0);
  });

  it("AC4: Discord sales notification should label Directory orders accurately, never fallback 'Premium Access'", async () => {
    const { POST } = await import("@/app/api/webhooks/polar/route");

    const directoryOrderEvent = {
      type: "order.created",
      id: "evt_discord_test",
      data: {
        id: "ord_discord_dir",
        status: "paid",
        paid: true,
        customer_email: "founder@example.com",
        customer_name: "Startup Founder",
        product_id: PRODUCT_IDS.DIRECTORY_STANDARD,
        amount: 4900,
        // Notice: product object has no name, testing fallback logic
      },
    };

    await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: {
          "webhook-id": "wh_discord_test",
          "webhook-timestamp": "1700000000",
          "webhook-signature": "v1,dummy",
        },
        body: JSON.stringify(directoryOrderEvent),
      })
    );

    expect(sendDiscordSalesMock).toHaveBeenCalledTimes(1);
    const notificationCall = sendDiscordSalesMock.mock.calls[0][0];
    expect(notificationCall.productName).toBe("Directory Listing Submission");
    expect(notificationCall.productName).not.toBe("Premium Access");
  });

  it("notifies Discord once per paid order across order.created, order.paid and Polar retries", async () => {
    const { POST } = await import("@/app/api/webhooks/polar/route");
    sendDiscordSalesMock.mockClear();

    const deliver = (webhookId: string, type: string) =>
      POST(
        new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
          method: "POST",
          headers: { "webhook-id": webhookId, "webhook-timestamp": "1700000000", "webhook-signature": "v1,dummy" },
          body: JSON.stringify({
            type,
            data: {
              id: "ord_discord_once",
              status: "paid",
              paid: true,
              customer_email: "buyer.once@example.com",
              product_id: PRODUCT_IDS.VIP_ANNUAL,
              product: { id: PRODUCT_IDS.VIP_ANNUAL, name: "VIP Annual" },
              total_amount: 29900,
              currency: "usd",
            },
          }),
        })
      );

    expect((await deliver("wh_once_created", "order.created")).status).toBe(200);
    expect((await deliver("wh_once_paid", "order.paid")).status).toBe(200);
    expect((await deliver("wh_once_paid", "order.paid")).status).toBe(200);

    expect(sendDiscordSalesMock).toHaveBeenCalledTimes(1);
    expect(sendDiscordSalesMock.mock.calls[0][0]).toMatchObject({
      productName: "VIP Annual",
      amount: 29900,
      currency: "usd",
      source: "Polar",
    });
  });

  it("keeps the webhook successful when the Discord notification fails", async () => {
    const { POST } = await import("@/app/api/webhooks/polar/route");
    sendDiscordSalesMock.mockClear().mockRejectedValueOnce(new Error("discord down"));

    const res = await POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: { "webhook-id": "wh_discord_down", "webhook-timestamp": "1700000000", "webhook-signature": "v1,dummy" },
        body: JSON.stringify({
          type: "order.paid",
          data: {
            id: "ord_discord_down",
            status: "paid",
            customer_email: "buyer.down@example.com",
            product_id: PRODUCT_IDS.PREMIUM_ANNUAL,
            total_amount: 9900,
            currency: "usd",
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(sendDiscordSalesMock).toHaveBeenCalledTimes(1);
  });
});

describe("Polar Webhook Route: order paidAt and customer identity", () => {
  const deliver = async (webhookId: string, type: string, data: Record<string, unknown>) => {
    const { POST } = await import("@/app/api/webhooks/polar/route");
    return POST(
      new Request("https://nextlevelbuilder.io/api/webhooks/polar", {
        method: "POST",
        headers: { "webhook-id": webhookId, "webhook-timestamp": "1700000000", "webhook-signature": "v1,dummy" },
        body: JSON.stringify({ type, data: { product_id: PRODUCT_IDS.PREMIUM_ANNUAL, total_amount: 9900, currency: "usd", ...data } }),
      })
    );
  };
  const findOrder = async (polarOrderId: string) => {
    const [row] = await getDb().select().from(orders).where(eq(orders.polarOrderId, polarOrderId));
    return row;
  };

  it("keeps the first paidAt, taken from the Polar order, across paid and updated redeliveries", async () => {
    const paidAt = "2026-10-01T03:00:00.000Z";
    const order = { id: "ord_paid_once", status: "paid", customer_id: "cus_paid_once", customer_email: "paid.once@example.com" };

    expect((await deliver("wh_paid_once_1", "order.paid", { ...order, created_at: "2026-10-01T02:59:00.000Z", modified_at: paidAt })).status).toBe(200);
    expect((await findOrder("ord_paid_once"))?.paidAt?.toISOString()).toBe(paidAt);

    expect((await deliver("wh_paid_once_2", "order.updated", { ...order, modified_at: "2026-10-05T00:00:00.000Z" })).status).toBe(200);
    expect((await deliver("wh_paid_once_3", "order.paid", { ...order, modified_at: "2026-10-06T00:00:00.000Z" })).status).toBe(200);
    expect((await findOrder("ord_paid_once"))?.paidAt?.toISOString()).toBe(paidAt);
  });

  it("sets paidAt when a pending order is later paid", async () => {
    const order = { id: "ord_pending_then_paid", customer_id: "cus_pending_paid", customer_email: "pending.paid@example.com" };
    expect((await deliver("wh_pending_1", "order.created", { ...order, status: "pending" })).status).toBe(200);
    expect((await findOrder("ord_pending_then_paid"))?.paidAt).toBeNull();

    const paidAt = "2026-10-02T08:00:00.000Z";
    expect((await deliver("wh_pending_2", "order.paid", { ...order, status: "paid", modified_at: paidAt })).status).toBe(200);
    expect((await findOrder("ord_pending_then_paid"))?.paidAt?.toISOString()).toBe(paidAt);
  });

  it("finds the customer by Polar customer id first and follows a Polar email change", async () => {
    expect((await deliver("wh_email_change_1", "order.paid", { id: "ord_email_change_1", status: "paid", customer_id: "cus_email_change", customer_email: "old.address@example.com" })).status).toBe(200);
    const [original] = await getDb().select().from(customers).where(eq(customers.polarCustomerId, "cus_email_change"));
    expect(original.email).toBe("old.address@example.com");

    expect((await deliver("wh_email_change_2", "order.paid", { id: "ord_email_change_2", status: "paid", customer_id: "cus_email_change", customer_email: "New.Address@example.com" })).status).toBe(200);

    const rows = await getDb().select().from(customers).where(eq(customers.polarCustomerId, "cus_email_change"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: original.id, email: "new.address@example.com" });
    expect(await getDb().select().from(customers).where(eq(customers.email, "old.address@example.com"))).toHaveLength(0);
    expect((await findOrder("ord_email_change_2"))?.customerId).toBe(original.id);
  });

  it("never attaches a different Polar customer to a row that shares its email", async () => {
    expect((await deliver("wh_shared_1", "order.paid", { id: "ord_shared_a", status: "paid", customer_id: "cus_shared_a", customer_email: "shared@example.com" })).status).toBe(200);
    const [owner] = await getDb().select().from(customers).where(eq(customers.email, "shared@example.com"));

    const res = await deliver("wh_shared_2", "order.paid", { id: "ord_shared_b", status: "paid", customer_id: "cus_shared_b", customer_email: "shared@example.com" });
    expect(res.status).toBe(500);

    const [after] = await getDb().select().from(customers).where(eq(customers.id, owner.id));
    expect(after.polarCustomerId).toBe("cus_shared_a");
    expect(await findOrder("ord_shared_b")).toBeUndefined();
  });

  it("claims an email-only customer row for its Polar customer id", async () => {
    const [legacy] = await getDb().insert(customers).values({ email: "legacy.row@example.com", name: "Legacy" }).returning();
    expect((await deliver("wh_legacy_1", "order.paid", { id: "ord_legacy", status: "paid", customer_id: "cus_legacy", customer_email: "legacy.row@example.com" })).status).toBe(200);

    const [after] = await getDb().select().from(customers).where(eq(customers.id, legacy.id));
    expect(after.polarCustomerId).toBe("cus_legacy");
    expect((await findOrder("ord_legacy"))?.customerId).toBe(legacy.id);
  });
});
