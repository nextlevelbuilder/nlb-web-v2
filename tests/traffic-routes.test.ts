import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ caller: vi.fn(), getDb: vi.fn(), published: vi.fn(), query: vi.fn(), record: vi.fn(), realtime: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: mocks.caller }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/domain/catalog", () => ({ getPublishedProductBySlug: mocks.published }));
vi.mock("@/lib/traffic/traffic", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/traffic/traffic")>(), queryTraffic: mocks.query, recordTraffic: mocks.record }));
vi.mock("@/lib/traffic/posthog", () => ({ realtimeTraffic: mocks.realtime, captureSitePageview: mocks.capture }));

import { GET as privateGet } from "@/app/api/v1/products/[slug]/traffic/route";
import { GET as publicGet } from "@/app/api/v1/products/[slug]/traffic/public/route";
import { POST as collect } from "@/app/api/traffic/route";
import { POST as posthogCollect } from "@/app/api/traffic/posthog/route";
import { GET as realtimeGet } from "@/app/api/traffic/realtime/route";
import { members, products } from "@/lib/db/schema";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

const params = { params: Promise.resolve({ slug: "product-a" }) };
const summary = {
  source: "clickhouse", from: "2026-09-10T00:00:00.000Z", to: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T08:00:00.000Z",
  pageViews: 8, visitors: 5, outboundClicks: 2, activeVisitors: 1,
  series: [{ date: "2026-09-10", pageViews: 8, visitors: 5, outboundClicks: 2 }],
  referrers: [{ name: "private.test", count: 8 }], countries: [{ name: "VN", count: 8 }], devices: [{ name: "desktop", count: 8 }],
};
const analytics = { id: "traffic-summary", type: "analytics", props: { period: "30d" } };
function getRequest(query = "", isPublic = false) {
  return new Request(`https://directory.test/api/v1/products/product-a/traffic${isPublic ? "/public" : ""}${query}`);
}
function eventRequest(body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request("https://directory.test/api/traffic", {
    method: "POST", headers: { origin: "https://directory.test", "content-type": "application/json", "user-agent": "Mozilla Chrome", ...headers },
    body: JSON.stringify({ event: "page_view", visitorId: crypto.randomUUID(), productSlug: "product-a", ...body }),
  });
}
function database(product: { id: string; orgId: string } | null = { id: "product-id", orgId: "org-a" }, membership = true) {
  const where = vi.fn();
  const db = { select: vi.fn(() => ({ from: vi.fn((table: unknown) => ({ where: (clause: unknown) => {
    where(table, clause);
    return { limit: vi.fn().mockResolvedValue(table === products ? product ? [product] : [] : membership ? [{ id: "member-id" }] : []) };
  } })) })) };
  mocks.getDb.mockReturnValue(db);
  return { db, where };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.caller.mockResolvedValue({ user: { id: "user-a", role: "user" } });
  mocks.query.mockResolvedValue(summary); mocks.record.mockResolvedValue(undefined); mocks.capture.mockResolvedValue(undefined);
  mocks.published.mockResolvedValue({ product: { id: "product-id" }, revision: { status: "approved", document: { blocks: [analytics] } } });
  database();
});
afterEach(() => vi.useRealTimers());

describe("private product traffic authorization", () => {
  it("rejects anonymous and scope-rejected callers before querying product data", async () => {
    mocks.caller.mockResolvedValue(null);
    const response = await privateGet(getRequest(), params);
    expect(response.status).toBe(401); expect(mocks.getDb).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.caller).toHaveBeenCalledWith(expect.any(Headers), undefined, { scope: "mcp:read", method: "GET", path: "/api/v1/products/product-a/traffic" });
  });

  it("requires membership in the product's organization", async () => {
    const { where } = database(undefined, false);
    const response = await privateGet(getRequest(), params);
    expect(response.status).toBe(403); expect(mocks.query).not.toHaveBeenCalled();
    const membershipClause = where.mock.calls.find(([table]) => table === members)?.[1];
    const sql = new SQLiteSyncDialect().sqlToQuery(membershipClause);
    expect(sql.params).toEqual(["org-a", "user-a"]);
  });

  it.each(["user", "admin"])("denies an organization-scoped key targeting another organization even for %s", async (role) => {
    const { db } = database({ id: "product-b", orgId: "org-b" }, true);
    mocks.caller.mockResolvedValue({ user: { id: "user-a", role }, authType: "api_key", apiKeyOrganizationId: "org-a" });
    const response = await privateGet(getRequest(), params);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden: API key belongs to another organization" });
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each(["org-a", null, undefined])("permits a member's matching or unscoped key: %j", async (apiKeyOrganizationId) => {
    mocks.caller.mockResolvedValue({ user: { id: "user-a", role: "user" }, authType: "api_key", apiKeyOrganizationId });
    const response = await privateGet(getRequest(), params);
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith("product-id", expect.any(Object));
  });

  it("still requires membership when the API key organization matches", async () => {
    database(undefined, false);
    mocks.caller.mockResolvedValue({ user: { id: "user-a", role: "user" }, authType: "api_key", apiKeyOrganizationId: "org-a" });
    expect((await privateGet(getRequest(), params)).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each(["member", "admin"])("permits %s access and prevents shared caching", async (role) => {
    database(undefined, role === "member");
    mocks.caller.mockResolvedValue({ user: { id: "user-a", role: role === "admin" ? "admin" : "user" } });
    const response = await privateGet(getRequest("?from=2026-09-10T00:00:00Z&to=2026-09-11T00:00:00Z"), params);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).data.referrers).toEqual(summary.referrers);
    expect(mocks.query).toHaveBeenCalledWith("product-id", { from: "2026-09-10T00:00:00.000Z", to: "2026-09-11T00:00:00.000Z" });
  });

  it("returns not found for unknown products and validates dates before storage", async () => {
    database(null);
    expect((await privateGet(getRequest(), params)).status).toBe(404);
    mocks.getDb.mockClear();
    expect((await privateGet(getRequest("?from=bad"), params)).status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns a generic unavailable error without credentials", async () => {
    mocks.query.mockRejectedValue(new Error("https://user:private-password@storage.test"));
    const response = await privateGet(getRequest(), params);
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "Traffic analytics unavailable" });
  });
});

describe("public product traffic opt-in", () => {
  it.each([
    null,
    { product: { id: "product-id" }, revision: { status: "draft", document: { blocks: [analytics] } } },
    { product: { id: "product-id" }, revision: { status: "approved", document: { blocks: [] } } },
    { product: { id: "product-id" }, revision: { status: "approved", document: { blocks: [{ type: "analytics" }] } } },
    { product: { id: "product-id" }, revision: { status: "approved", document: { blocks: [{ ...analytics, props: { period: "forever" } }] } } },
  ])("rejects products without approved valid opt-in: %j", async (published) => {
    mocks.published.mockResolvedValue(published);
    expect((await publicGet(getRequest("", true), params)).status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([
    ["approved", false], ["approved", true], ["published", false], ["published", true],
  ])("reads %s JSON (string=%s), exposes totals only and rechecks opt-in", async (status, asString) => {
    mocks.published.mockResolvedValue({ product: { id: "product-id" }, revision: { status, document: asString ? JSON.stringify({ blocks: [analytics] }) : { blocks: [analytics] } } });
    const response = await publicGet(getRequest("?period=7d", true), params);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.pageViews).toBe(8);
    for (const key of ["referrers", "countries", "devices"]) expect(body.data).not.toHaveProperty(key);
    expect(mocks.query).toHaveBeenCalledWith("product-id", expect.any(Object), false);
    mocks.published.mockResolvedValue(null);
    expect((await publicGet(getRequest("", true), params)).status).toBe(404);
  });

  it("rejects an unbounded period", async () => {
    expect((await publicGet(getRequest("?period=365d", true), params)).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("public traffic ingestion", () => {
  it("collects published products using server-resolved product IDs", async () => {
    const { where } = database();
    const request = eventRequest();
    expect((await collect(request)).status).toBe(202);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ productId: "product-id", event: "page_view" }), request);
    expect(new SQLiteSyncDialect().sqlToQuery(where.mock.calls[0][1]).params).toEqual(["product-a", "published"]);
  });

  it("rejects unknown or draft products before recording", async () => {
    database(null);
    expect((await collect(eventRequest())).status).toBe(404); expect(mocks.record).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{ origin: "https://attacker.test" }, { dnt: "1" }, { "sec-gpc": "1" }, { "user-agent": "Crawler" }])("discards excluded visits: %j", async (headers) => {
    expect((await collect(eventRequest({}, headers))).status).toBe(204);
    expect(mocks.getDb).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled();
  });

  it("rejects oversized and extra-field bodies without insertion", async () => {
    expect((await collect(eventRequest({ country: "VN" }))).status).toBe(400);
    expect((await collect(eventRequest({ referrer: "x".repeat(5000) }, { "content-length": "2" }))).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("separates directory ClickHouse collection from PostHog", async () => {
    expect((await collect(eventRequest({ productSlug: undefined }))).status).toBe(202);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ productId: "" }), expect.any(Request));
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("hides storage failures", async () => {
    mocks.record.mockRejectedValue(new Error("private-storage-password"));
    const response = await collect(eventRequest());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "Traffic collection unavailable" });
  });
});

describe("PostHog public routes", () => {
  function captureRequest(extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return new Request("https://directory.test/api/traffic/posthog", { method: "POST", headers: { origin: "https://directory.test", "content-type": "application/json", ...headers }, body: JSON.stringify({ visitorId: crypto.randomUUID(), path: "/leaderboards", ...extra }) });
  }

  it("accepts only the fixed capture body and obeys privacy controls", async () => {
    expect((await posthogCollect(captureRequest())).status).toBe(202);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ path: "/leaderboards" }));
    expect((await posthogCollect(captureRequest({ event: "$identify" }))).status).toBe(400);
    expect((await posthogCollect(captureRequest({ path: "leaderboards" }))).status).toBe(400);
    expect((await posthogCollect(captureRequest({ path: "/x".repeat(201) }))).status).toBe(400);
    expect((await posthogCollect(captureRequest({ path: "/leaderboards?page=2" }))).status).toBe(400);
    expect((await posthogCollect(captureRequest({}, { dnt: "1" }))).status).toBe(204);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it("returns real cached aggregates and honest provider errors", async () => {
    const data = { source: "posthog", activeVisitors: 2, pageViews30d: 20, visitors30d: 10, updatedAt: summary.updatedAt, windowMinutes: 5, windowDays: 30 };
    mocks.realtime.mockResolvedValue(data);
    const response = await realtimeGet();
    expect(await response.json()).toEqual({ data }); expect(response.headers.get("cache-control")).toContain("max-age=30");
    mocks.realtime.mockRejectedValue(new Error("private-query-key"));
    const failed = await realtimeGet(); expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "Live traffic is temporarily unavailable" });
  });
});
