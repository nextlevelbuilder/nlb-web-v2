import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.hoisted(() => {
  process.env.SEPAY_ENABLED = "true";
  process.env.SEPAY_WEBHOOK_API_KEY = "test-sepay-key";
  process.env.SEPAY_BANK_ACCOUNT = "0123456789";
  process.env.SEPAY_BANK_CODE = "MBBank";
  process.env.SEPAY_USD_VND_RATE = "26000";
  process.env.SEPAY_ORDERS_DISCORD_WEBHOOK_URL = "https://discord.example/api/webhooks/1/test";
  process.env.ONBOARDING_V2_ENABLED = "true";
});

import type { ResolvedCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { courseVideos, entitlements, onboardingJobs, orders, sepayOrders, users } from "@/lib/db/schema";
import { getMemberTier } from "@/lib/membership/member-access";
import { resolveStaticSku, usdToVnd } from "@/lib/payments/sepay-catalog";
import { extractOrderCode, generateOrderCode, verifySepayAuthorization } from "@/lib/payments/sepay-orders";

const resolveCallerMock = vi.fn<(headers: Headers) => Promise<ResolvedCaller | null>>();
vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: (headers: Headers) => resolveCallerMock(headers) }));
const discordMock = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/discord", () => ({ sendDiscordSalesNotification: (...args: unknown[]) => discordMock(...args) }));
vi.mock("@/lib/onboarding/runner", () => ({ runDueJobs: vi.fn().mockResolvedValue(undefined) }));

const { POST: createCheckout } = await import("@/app/api/checkout/sepay/route");
const { GET: getCheckout } = await import("@/app/api/checkout/sepay/[code]/route");
const { POST: sepayWebhook } = await import("@/app/api/webhooks/sepay/route");

let seq = 0;
async function createUser() {
  const id = `sepay-user-${++seq}`;
  const email = `buyer${seq}@example.com`;
  await getDb().insert(users).values({ id, name: id, email, emailVerified: true });
  return { id, email };
}

function signIn(user: { id: string; email: string }) {
  resolveCallerMock.mockResolvedValue({ user: { id: user.id, name: user.id, email: user.email, emailVerified: true } } as ResolvedCaller);
}

async function checkout(body: Record<string, unknown>) {
  const res = await createCheckout(
    new Request("https://nlb.test/api/checkout/sepay", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })
  );
  return { res, body: (await res.json()) as { orderCode: string; amountVnd: number; qrUrl: string; status: string } };
}

let txId = 1000;
function transfer(content: string, amount: number, overrides: Record<string, unknown> = {}) {
  return {
    id: ++txId,
    gateway: "MBBank",
    transactionDate: "2026-11-17 22:00:00",
    accountNumber: "0123456789",
    code: null,
    content,
    transferType: "in",
    transferAmount: amount,
    accumulated: 0,
    subAccount: null,
    referenceCode: `FT${txId}`,
    description: content,
    ...overrides,
  };
}

async function deliver(payload: unknown, key = "test-sepay-key") {
  const res = await sepayWebhook(
    new Request("https://nlb.test/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json", authorization: `Apikey ${key}` },
    })
  );
  return { status: res.status, body: (await res.json()) as { success: boolean; outcome?: string; duplicate?: boolean } };
}

async function order(code: string) {
  const [row] = await getDb().select().from(sepayOrders).where(eq(sepayOrders.orderCode, code));
  return row;
}

beforeEach(() => {
  discordMock.mockClear();
  resolveCallerMock.mockReset();
});

describe("SePay catalog and helpers", () => {
  it("derives VND prices from the USD list price and rounds to 1,000 VND", () => {
    expect(usdToVnd(147, 26000)).toBe(3_822_000);
    expect(usdToVnd(19, 25_412)).toBe(483_000);
    expect(resolveStaticSku("premium_quarterly")).toMatchObject({ kind: "membership", periodMonths: 3, amountVnd: 3_822_000 });
    expect(resolveStaticSku("vip_annual")).toMatchObject({ periodMonths: 12, amountVnd: usdToVnd(948, 26000) });
  });

  it("does not sell the toolkit until its USD price is configured", () => {
    expect(resolveStaticSku("publishing_toolkit")).toBeNull();
  });

  it("finds the order code in bank-mangled transfer content", () => {
    const code = generateOrderCode();
    expect(code).toMatch(/^NLB[A-Z2-9]{10}$/);
    expect(extractOrderCode(null, `MBVCB.123 ${code.toLowerCase()} chuyen tien`)).toBe(code);
    expect(extractOrderCode(`${code.slice(0, 6)} ${code.slice(6)}`)).toBe(code);
    expect(extractOrderCode("no code here")).toBeNull();
  });

  it("accepts only the configured API key", () => {
    expect(verifySepayAuthorization("Apikey secret", "secret")).toBe(true);
    expect(verifySepayAuthorization("apikey secret", "secret")).toBe(true);
    expect(verifySepayAuthorization("Apikey wrong!", "secret")).toBe(false);
    expect(verifySepayAuthorization("Bearer secret", "secret")).toBe(false);
    expect(verifySepayAuthorization("Apikey secret", undefined)).toBe(false);
  });
});

describe("SePay checkout", () => {
  it("requires sign-in and a sellable product", async () => {
    resolveCallerMock.mockResolvedValue(null);
    expect((await checkout({ sku: "premium_quarterly" })).res.status).toBe(401);
    signIn(await createUser());
    expect((await checkout({ sku: "publishing_toolkit" })).res.status).toBe(404);
    expect((await checkout({ sku: "nope" })).res.status).toBe(400);
  });

  it("creates a pending order with the server-side price and a VietQR", async () => {
    signIn(await createUser());
    const { res, body } = await checkout({ sku: "vip_quarterly", locale: "vi" });
    expect(res.status).toBe(201);
    expect(body.amountVnd).toBe(usdToVnd(297, 26000));
    expect(body.status).toBe("pending");
    const qr = new URL(body.qrUrl);
    expect(qr.hostname).toBe("qr.sepay.vn");
    expect(qr.searchParams.get("des")).toBe(body.orderCode);
    expect(qr.searchParams.get("amount")).toBe(String(body.amountVnd));
  });

  it("shows an order's status to its owner only", async () => {
    const owner = await createUser();
    signIn(owner);
    const { body } = await checkout({ sku: "premium_annual" });
    const params = { params: Promise.resolve({ code: body.orderCode }) };
    expect((await getCheckout(new Request("https://nlb.test"), params)).status).toBe(200);
    signIn(await createUser());
    expect((await getCheckout(new Request("https://nlb.test"), params)).status).toBe(404);
  });
});

describe("SePay webhook", () => {
  it("rejects deliveries without the API key", async () => {
    expect((await deliver(transfer("x", 1), "wrong")).status).toBe(401);
  });

  it("pays an exact-amount transfer once, grants the membership and notifies Discord once", async () => {
    const user = await createUser();
    signIn(user);
    const { body } = await checkout({ sku: "premium_quarterly" });
    const payment = transfer(`IBFT ${body.orderCode} thanh toan`, body.amountVnd);

    const first = await deliver(payment);
    expect(first).toEqual({ status: 200, body: { success: true, outcome: "paid" } });
    const paid = await order(body.orderCode);
    expect(paid.status).toBe("paid");
    expect(paid.sepayTransactionId).toBe(String(payment.id));
    expect(paid.validUntil!.getUTCMonth()).toBe((paid.validFrom!.getUTCMonth() + 3) % 12);

    const tier = await getMemberTier(getDb(), user.id);
    expect(tier.tier).toBe("premium");
    expect(tier.validUntil?.getTime()).toBe(paid.validUntil!.getTime());

    const jobs = await getDb().select().from(onboardingJobs);
    const keys = jobs.map((job) => job.dedupeKey);
    expect(keys.some((key) => key.startsWith(`reconcile_access:${user.id}:`))).toBe(true);
    expect(keys).toContain(`welcome_email:sepay:${body.orderCode}`);
    const [ledger] = await getDb().select().from(orders).where(eq(orders.polarOrderId, `sepay_${body.orderCode}`));
    expect(ledger).toMatchObject({ currency: "vnd", status: "paid", amount: String(body.amountVnd) });

    expect(discordMock).toHaveBeenCalledTimes(1);
    expect(discordMock.mock.calls[0][0]).toMatchObject({
      source: "SePay",
      currency: "vnd",
      amount: body.amountVnd,
      reference: body.orderCode,
      webhookUrl: "https://discord.example/api/webhooks/1/test",
    });

    // SePay retries the same transaction: acknowledged as a duplicate, nothing granted or sent twice.
    expect((await deliver(payment)).body).toMatchObject({ success: true, duplicate: true });
    // A second transfer for an already-paid code is recorded but grants nothing new.
    expect((await deliver(transfer(body.orderCode, body.amountVnd))).body.outcome).toBe("already_paid");
    expect(discordMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a different amount, then pays a later exact transfer", async () => {
    const user = await createUser();
    signIn(user);
    const { body } = await checkout({ sku: "vip_annual" });

    expect((await deliver(transfer(body.orderCode, body.amountVnd - 1000))).body.outcome).toBe("amount_mismatch");
    expect(await order(body.orderCode)).toMatchObject({ status: "amount_mismatch", receivedAmountVnd: body.amountVnd - 1000 });
    expect((await getMemberTier(getDb(), user.id)).tier).toBe("none");
    expect(discordMock).not.toHaveBeenCalled();

    expect((await deliver(transfer(body.orderCode, body.amountVnd))).body.outcome).toBe("paid");
    expect((await getMemberTier(getDb(), user.id)).tier).toBe("vip");
  });

  it("acknowledges outgoing and unmatched transfers without granting anything", async () => {
    expect((await deliver(transfer("NLBAAAAAAAAAA", 1000))).body.outcome).toBe("no_order");
    expect((await deliver(transfer("salary", 1000, { transferType: "out" }))).body.outcome).toBe("ignored");
  });

  it("accepts the Bank Hub IPN shape", async () => {
    const user = await createUser();
    signIn(user);
    const { body } = await checkout({ sku: "premium_quarterly" });
    const ipn = {
      gateway: "MBBank",
      transaction_date: "2026-11-17 22:10:00",
      account_number: "0123456789",
      bank_account_xid: "bank-xid",
      va: null,
      payment_code: body.orderCode,
      content: `${body.orderCode} chuyen khoan`,
      transfer_type: "credit",
      amount: body.amountVnd,
      reference_code: "FT999",
      accumulated: 0,
      transaction_id: `bh-${++txId}`,
    };
    expect((await deliver(ipn)).body.outcome).toBe("paid");
    expect((await deliver({ event: "BANK_ACCOUNT_LINKED", data: {} })).body).toMatchObject({ success: true, outcome: "ignored" });
  });

  it("stacks a renewal onto the end of the current prepaid period", async () => {
    const user = await createUser();
    signIn(user);
    const first = (await checkout({ sku: "premium_quarterly" })).body;
    await deliver(transfer(first.orderCode, first.amountVnd));
    const second = (await checkout({ sku: "premium_quarterly" })).body;
    await deliver(transfer(second.orderCode, second.amountVnd));
    const [a, b] = [await order(first.orderCode), await order(second.orderCode)];
    expect(b.validFrom!.getTime()).toBe(a.validUntil!.getTime());
    expect((await getMemberTier(getDb(), user.id)).validUntil?.getTime()).toBe(b.validUntil!.getTime());
  });

  it("expires the prepaid membership at the end of its period", async () => {
    const user = await createUser();
    signIn(user);
    const { body } = await checkout({ sku: "premium_quarterly" });
    await deliver(transfer(body.orderCode, body.amountVnd));
    const paid = await order(body.orderCode);
    expect((await getMemberTier(getDb(), user.id, new Date(paid.validUntil!.getTime() + 1))).tier).toBe("none");
  });

  it("grants a course video entitlement", async () => {
    const user = await createUser();
    signIn(user);
    const [video] = await getDb()
      .insert(courseVideos)
      .values({ slug: `sepay-video-${seq}`, title: "Week 7", priceCents: 1900, status: "published" })
      .returning();
    const { res, body } = await checkout({ courseVideoSlug: video.slug });
    expect(res.status).toBe(201);
    expect(body.amountVnd).toBe(usdToVnd(19, 26000));
    await deliver(transfer(body.orderCode, body.amountVnd));
    const [grant] = await getDb()
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.userId, user.id), eq(entitlements.featureKey, `video:${video.id}`)));
    expect(grant?.isActive).toBe(true);
  });
});
