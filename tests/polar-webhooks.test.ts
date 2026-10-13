import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PRODUCT_IDS,
  MEMBERSHIP_PRODUCT_IDS,
  DIRECTORY_PRODUCT_IDS,
  ALLOWED_PRODUCT_IDS,
  isMembershipProduct,
  isDirectoryProduct,
  isOurProduct,
} from "@/lib/polar";

// Mock Resend and Discord notifications
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

// Mock database state and tables for webhook routing tests
let deliveryIntentsStore = new Map<string, any>();
let webhookEventsStore = new Set<string>();
let customersStore = new Map<string, any>();
let subscriptionsStore = new Map<string, any>();
let ordersStore = new Map<string, any>();

function createMockDb() {
  return {
    insert: vi.fn((table: any) => ({
      values: vi.fn((vals: any) => {
        const row = Array.isArray(vals) ? vals[0] : vals;
        return {
          onConflictDoNothing: vi.fn((opts?: any) => {
            return {
              returning: vi.fn().mockImplementation(async () => {
                // Table: deliveryIntents
                if (row.idempotencyKey) {
                  if (deliveryIntentsStore.has(row.idempotencyKey)) {
                    return [];
                  }
                  deliveryIntentsStore.set(row.idempotencyKey, { ...row, id: `intent_${Date.now()}` });
                  return [deliveryIntentsStore.get(row.idempotencyKey)];
                }
                // Table: webhookEvents
                if (row.eventId) {
                  if (webhookEventsStore.has(row.eventId)) {
                    return [];
                  }
                  webhookEventsStore.add(row.eventId);
                  return [{ ...row, id: `evt_row_${Date.now()}` }];
                }
                return [{ ...row, id: "gen_id" }];
              }),
            };
          }),
          onConflictDoUpdate: vi.fn((opts?: any) => {
            return {
              returning: vi.fn().mockImplementation(async () => {
                if (row.email) {
                  // customers table
                  customersStore.set(row.email, { id: `cust_${customersStore.size + 1}`, ...row });
                  return [customersStore.get(row.email)];
                }
                if (row.polarSubscriptionId) {
                  // subscriptions table
                  subscriptionsStore.set(row.polarSubscriptionId, { id: `sub_${subscriptionsStore.size + 1}`, ...row });
                  return [subscriptionsStore.get(row.polarSubscriptionId)];
                }
                if (row.polarOrderId) {
                  // orders table
                  ordersStore.set(row.polarOrderId, { id: `order_${ordersStore.size + 1}`, ...row });
                  return [ordersStore.get(row.polarOrderId)];
                }
                return [{ ...row, id: "updated_id" }];
              }),
            };
          }),
          returning: vi.fn().mockResolvedValue([{ ...row, id: "ret_id" }]),
        };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn((table: any) => ({
        where: vi.fn((cond: any) => ({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((vals: any) => ({
        where: vi.fn().mockResolvedValue([{ ...vals }]),
      })),
    })),
  };
}

let mockDb = createMockDb();

vi.mock("@/lib/db", () => ({
  getDb: () => mockDb,
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
    deliveryIntentsStore.clear();
    webhookEventsStore.clear();
    customersStore.clear();
    subscriptionsStore.clear();
    ordersStore.clear();
    mockDb = createMockDb();
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
});
