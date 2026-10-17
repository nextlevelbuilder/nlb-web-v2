import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { exportJWK, generateKeyPair, jwtVerify, type CryptoKey } from "jose";
import { getDb } from "@/lib/db";
import { courseVideos, customers, entitlements, orders, subscriptions, users } from "@/lib/db/schema";
import { PRODUCT_IDS } from "@/lib/polar";
import type { ResolvedCaller } from "@/lib/auth-api-key";

const resolveCallerMock = vi.fn<(headers: Headers) => Promise<ResolvedCaller | null>>();
vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: (headers: Headers) => resolveCallerMock(headers) }));

const { POST: issueToken } = await import("@/app/api/courses/videos/[slug]/token/route");
const { GET: getDetail } = await import("@/app/api/courses/videos/[slug]/route");

const STREAM_UID = "fedcba9876543210fedcba9876543210";
const VIDEO_PRODUCT_ID = "polar-product-video-1";
let publicKey: CryptoKey;
let keyMaterial: string;
let seq = 0;

function callerFor(id: string, email: string): ResolvedCaller {
  return { user: { id, name: id, email, role: "user", emailVerified: true }, authType: "session" };
}

async function seedUser(): Promise<ResolvedCaller> {
  seq += 1;
  const id = `user-${seq}`;
  const email = `buyer${seq}@example.com`;
  await getDb().insert(users).values({ id, name: id, email });
  return callerFor(id, email);
}

async function seedCustomer(email: string): Promise<string> {
  const [customer] = await getDb().insert(customers).values({ email }).returning();
  return customer.id;
}

async function seedVideo(overrides: Partial<typeof courseVideos.$inferInsert> = {}) {
  seq += 1;
  const [video] = await getDb()
    .insert(courseVideos)
    .values({
      slug: `video-${seq}`,
      title: "Week 1",
      priceCents: 1900,
      streamUid: STREAM_UID,
      streamSignedOnly: true,
      status: "published",
      polarProductId: `${VIDEO_PRODUCT_ID}-${seq}`,
      publishedAt: new Date(),
      ...overrides,
    })
    .returning();
  return video;
}

function tokenRequest(slug: string) {
  return issueToken(new Request(`https://nlb.test/api/courses/videos/${slug}/token`, { method: "POST" }), {
    params: Promise.resolve({ slug }),
  });
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  publicKey = pair.publicKey;
  keyMaterial = Buffer.from(JSON.stringify(await exportJWK(pair.privateKey))).toString("base64");
});

beforeEach(() => {
  resolveCallerMock.mockReset();
  vi.stubEnv("CF_STREAM_SIGNING_KEY_ID", "test-key-id");
  vi.stubEnv("CF_STREAM_SIGNING_KEY_JWK", keyMaterial);
  vi.stubEnv("CF_STREAM_CUSTOMER_SUBDOMAIN", "customer-test123.cloudflarestream.com");
  vi.stubEnv("COURSES_ACCESS_PLANS", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/courses/videos/[slug]/token", () => {
  it("returns 401 for an anonymous caller", async () => {
    const video = await seedVideo();
    resolveCallerMock.mockResolvedValue(null);
    const res = await tokenRequest(video.slug);
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown or draft video", async () => {
    resolveCallerMock.mockResolvedValue(await seedUser());
    expect((await tokenRequest("does-not-exist")).status).toBe(404);
    const draft = await seedVideo({ status: "draft", polarProductId: null, publishedAt: null });
    expect((await tokenRequest(draft.slug)).status).toBe(404);
  });

  it("returns 403 for a signed-in user without purchase or VIP", async () => {
    const video = await seedVideo();
    resolveCallerMock.mockResolvedValue(await seedUser());
    const res = await tokenRequest(video.slug);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "purchase_required" });
  });

  it("returns 200 with a verifiable signed URL for an entitlement holder", async () => {
    const video = await seedVideo();
    const caller = await seedUser();
    await getDb().insert(entitlements).values({ userId: caller.user.id, featureKey: `video:${video.id}` });
    resolveCallerMock.mockResolvedValue(caller);

    const res = await tokenRequest(video.slug);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { token: string; iframeUrl: string; hlsUrl: string; expiresAt: string } };
    const { payload } = await jwtVerify(data.token, publicKey, { algorithms: ["RS256"] });
    expect(payload).toMatchObject({ sub: STREAM_UID, kid: "test-key-id" });
    expect(data.iframeUrl).toBe(`https://customer-test123.cloudflarestream.com/${data.token}/iframe`);
    expect(data.hlsUrl).toBe(`https://customer-test123.cloudflarestream.com/${data.token}/manifest/video.m3u8`);
    expect(Date.parse(data.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("keeps archived videos playable for entitled users only", async () => {
    const video = await seedVideo({ status: "archived" });
    const buyer = await seedUser();
    await getDb().insert(entitlements).values({ userId: buyer.user.id, featureKey: `video:${video.id}` });
    resolveCallerMock.mockResolvedValue(buyer);
    expect((await tokenRequest(video.slug)).status).toBe(200);
    resolveCallerMock.mockResolvedValue(await seedUser());
    expect((await tokenRequest(video.slug)).status).toBe(403);
  });

  it("returns 200 for a buyer whose paid order is recorded but not yet entitled", async () => {
    const video = await seedVideo();
    const caller = await seedUser();
    const customerId = await seedCustomer(caller.user.email);
    await getDb().insert(orders).values({
      customerId, polarOrderId: `ord-${seq}`, polarProductId: video.polarProductId!,
      productName: video.title, amount: "1900", currency: "usd", status: "paid", paidAt: new Date(),
    });
    resolveCallerMock.mockResolvedValue(caller);
    expect((await tokenRequest(video.slug)).status).toBe(200);
  });

  it("returns 200 for an active VIP and 403 for an active Premium-only member", async () => {
    const video = await seedVideo();
    const vip = await seedUser();
    const premium = await seedUser();
    for (const [caller, productId] of [[vip, PRODUCT_IDS.VIP_ANNUAL], [premium, PRODUCT_IDS.PREMIUM_ANNUAL]] as const) {
      const customerId = await seedCustomer(caller.user.email);
      await getDb().insert(subscriptions).values({
        customerId, polarSubscriptionId: `sub-${caller.user.id}`, polarProductId: productId,
        productName: "Membership", status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000),
      });
    }
    resolveCallerMock.mockResolvedValue(vip);
    expect((await tokenRequest(video.slug)).status).toBe(200);
    resolveCallerMock.mockResolvedValue(premium);
    expect((await tokenRequest(video.slug)).status).toBe(403);
  });

  it("returns 403 for a VIP whose subscription is canceled", async () => {
    const video = await seedVideo();
    const caller = await seedUser();
    const customerId = await seedCustomer(caller.user.email);
    await getDb().insert(subscriptions).values({
      customerId, polarSubscriptionId: `sub-canceled-${seq}`, polarProductId: PRODUCT_IDS.VIP_QUARTERLY,
      productName: "VIP", status: "canceled",
    });
    resolveCallerMock.mockResolvedValue(caller);
    expect((await tokenRequest(video.slug)).status).toBe(403);
  });

  it("keeps access through a partially refunded order and ends it on a full refund", async () => {
    const video = await seedVideo();
    const caller = await seedUser();
    const customerId = await seedCustomer(caller.user.email);
    const [order] = await getDb().insert(orders).values({
      customerId, polarOrderId: `ord-partial-${seq}`, polarProductId: video.polarProductId!, productName: video.title,
      amount: "1900", currency: "usd", status: "partially_refunded",
    }).returning();
    resolveCallerMock.mockResolvedValue(caller);
    expect((await tokenRequest(video.slug)).status).toBe(200);
    await getDb().update(orders).set({ status: "refunded" }).where(eq(orders.id, order.id));
    expect((await tokenRequest(video.slug)).status).toBe(403);
  });

  it("keeps access for a VIP who cancelled until the paid period ends, then refuses", async () => {
    const video = await seedVideo();
    const caller = await seedUser();
    const customerId = await seedCustomer(caller.user.email);
    const [subscription] = await getDb().insert(subscriptions).values({
      customerId, polarSubscriptionId: `sub-cancel-at-end-${seq}`, polarProductId: PRODUCT_IDS.VIP_QUARTERLY,
      productName: "VIP", status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: new Date(Date.now() + 3_600_000),
    }).returning();
    resolveCallerMock.mockResolvedValue(caller);
    expect((await tokenRequest(video.slug)).status).toBe(200);

    // A missed revoke webhook leaves status active; the elapsed period still ends access.
    await getDb().update(subscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(subscriptions.id, subscription.id));
    expect((await tokenRequest(video.slug)).status).toBe(403);
  });

  it("refuses an active VIP subscription with no recorded period end", async () => {
    const video = await seedVideo();
    const caller = await seedUser();
    const customerId = await seedCustomer(caller.user.email);
    await getDb().insert(subscriptions).values({
      customerId, polarSubscriptionId: `sub-no-period-${seq}`, polarProductId: PRODUCT_IDS.VIP_ANNUAL,
      productName: "VIP", status: "active",
    });
    resolveCallerMock.mockResolvedValue(caller);
    expect((await tokenRequest(video.slug)).status).toBe(403);
  });

  it("refuses to issue a token for a video Stream has not confirmed as signed-only (409)", async () => {
    const video = await seedVideo({ streamSignedOnly: false });
    const caller = await seedUser();
    await getDb().insert(entitlements).values({ userId: caller.user.id, featureKey: `video:${video.id}` });
    resolveCallerMock.mockResolvedValue(caller);
    const res = await tokenRequest(video.slug);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "stream_not_signed_only" });
  });

  it("returns 503 (never an unsigned URL) when Stream secrets are missing", async () => {
    const video = await seedVideo();
    const caller = await seedUser();
    await getDb().insert(entitlements).values({ userId: caller.user.id, featureKey: `video:${video.id}` });
    resolveCallerMock.mockResolvedValue(caller);
    vi.stubEnv("CF_STREAM_SIGNING_KEY_JWK", "");

    const res = await tokenRequest(video.slug);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ code: "stream_not_configured" });
    expect(JSON.stringify(body)).not.toContain(STREAM_UID);
  });
});

describe("GET /api/courses/videos/[slug]", () => {
  it("reports hasAccess per caller and hides Stream/Polar identifiers", async () => {
    const video = await seedVideo();
    const caller = await seedUser();
    await getDb().insert(entitlements).values({ userId: caller.user.id, featureKey: `video:${video.id}` });

    resolveCallerMock.mockResolvedValue(null);
    const anon = await getDetail(new Request("https://nlb.test"), { params: Promise.resolve({ slug: video.slug }) });
    const anonBody = await anon.json();
    expect(anonBody.data).toMatchObject({ slug: video.slug, priceCents: 1900, hasAccess: false });
    expect(anonBody.data.streamUid).toBeUndefined();
    expect(anonBody.data.polarProductId).toBeUndefined();

    resolveCallerMock.mockResolvedValue(caller);
    const owned = await getDetail(new Request("https://nlb.test"), { params: Promise.resolve({ slug: video.slug }) });
    expect((await owned.json()).data.hasAccess).toBe(true);
  });
});
