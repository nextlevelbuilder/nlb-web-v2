import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedCaller } from "@/lib/auth-api-key";

const resolveCallerMock = vi.fn<(headers: Headers) => Promise<ResolvedCaller | null>>();
vi.mock("@/lib/auth-api-key", () => ({ resolveCaller: (headers: Headers) => resolveCallerMock(headers) }));
vi.mock("@/lib/polar", () => ({
  MEMBERSHIP_PLAN_PRODUCT_IDS: { premium: ["prod_premium"], vip: ["prod_vip"] },
  EARLYBIRD_MEMBERSHIP_PRODUCT_IDS: { premium: undefined, vip: undefined },
}));
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
  }),
}));

import { getDb } from "@/lib/db";
import { builderPilotMembers, customers, subscriptions, users } from "@/lib/db/schema";
import { createShareLink } from "@/lib/builder-league/share-links";
import { SHARE_REF_COOKIE, VISITOR_COOKIE } from "@/lib/builder-league/attribution";
import { GET as journeyGet } from "@/app/api/v1/builder-journey/route";
import { GET as yearGet, PATCH as yearPatch } from "@/app/api/v1/builder-year/[year]/route";
import { POST as sharePost } from "@/app/api/v1/builder-year/[year]/share/route";
import { POST as renderPost } from "@/app/api/v1/builder-year/[year]/render/route";
import { GET as wrappedGet } from "@/app/api/v1/builder-wrapped/[year]/route";
import { POST as visitPost } from "@/app/api/v1/builder-wrapped/visit/route";
import { GET as adminJobsGet } from "@/app/api/v1/builder-admin/render-jobs/route";

const caller = (id: string, role = "user", authType: ResolvedCaller["authType"] = "session"): ResolvedCaller => ({
  user: { id, name: id, email: `${id}@example.com`, role, emailVerified: true },
  authType,
});
const req = (path: string, init?: RequestInit) => new Request(`https://example.test${path}`, init);
const yearParams = (year = "2026") => ({ params: Promise.resolve({ year }) });
let token = "";

beforeAll(async () => {
  const db = getDb();
  await db.insert(users).values([
    { id: "pilot", name: "Pilot", email: "pilot@example.com", emailVerified: true },
    { id: "outsider", name: "Outsider", email: "outsider@example.com", emailVerified: true },
    { id: "admin", name: "Admin", email: "admin@example.com", emailVerified: true, role: "admin" },
  ]);
  await db.insert(customers).values({ id: "c-pilot", email: "pilot@example.com", userId: "pilot" });
  await db.insert(subscriptions).values({
    customerId: "c-pilot", polarSubscriptionId: "sub_pilot", polarProductId: "prod_premium", productName: "Premium", status: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
  });
  await db.insert(builderPilotMembers).values({ userId: "pilot", addedBy: "admin" });
  token = (await createShareLink(db, { userId: "pilot", kind: "year_review", year: 2026 })).token;
});

beforeEach(() => {
  resolveCallerMock.mockReset();
  cookieJar.clear();
  vi.stubEnv("BUILDER_LEAGUE_ENABLED", "false");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("journey, year and wrapped routes with the flag off", () => {
  it("404 private routes for signed-out callers and non-pilot members", async () => {
    for (const who of [null, caller("outsider")]) {
      resolveCallerMock.mockResolvedValue(who);
      expect((await journeyGet(req("/api/v1/builder-journey"))).status).toBe(404);
      expect((await yearGet(req("/api/v1/builder-year/2026"), yearParams())).status).toBe(404);
      expect((await sharePost(req("/api/v1/builder-year/2026/share", { method: "POST", body: "{}" }), yearParams())).status).toBe(404);
      expect((await renderPost(req("/api/v1/builder-year/2026/render", { method: "POST", body: "{}" }), yearParams())).status).toBe(404);
    }
  });

  it("404 public wrapped routes for everyone but admins and pilots, and sets no cookie", async () => {
    resolveCallerMock.mockResolvedValue(null);
    expect((await wrappedGet(req("/api/v1/builder-wrapped/2026"), yearParams())).status).toBe(404);
    const visit = await visitPost(req("/api/v1/builder-wrapped/visit", { method: "POST", body: JSON.stringify({ token }) }));
    expect(visit.status).toBe(404);
    expect(cookieJar.size).toBe(0);
  });

  it("lets a pilot member through", async () => {
    resolveCallerMock.mockResolvedValue(caller("pilot"));
    const journey = await journeyGet(req("/api/v1/builder-journey"));
    expect(journey.status).toBe(200);
    expect((await yearGet(req("/api/v1/builder-year/2026"), yearParams())).status).toBe(200);
    expect((await wrappedGet(req("/api/v1/builder-wrapped/2026"), yearParams())).status).toBe(200);
    expect((await yearGet(req("/api/v1/builder-year/1999"), yearParams("1999"))).status).toBe(404);
  });

  it("refuses scene changes from API keys and delegated agents", async () => {
    resolveCallerMock.mockResolvedValue(caller("pilot", "user", "api_key"));
    const res = await yearPatch(req("/api/v1/builder-year/2026", { method: "PATCH", body: JSON.stringify({ hiddenScenes: [] }) }), yearParams());
    expect(res.status).toBe(403);
  });

  it("records a share visit with hashed-visitor cookies when the flag is on", async () => {
    vi.stubEnv("BUILDER_LEAGUE_ENABLED", "true");
    resolveCallerMock.mockResolvedValue(null);
    const res = await visitPost(req("/api/v1/builder-wrapped/visit", { method: "POST", body: JSON.stringify({ token, utm: { utm_source: "x" } }) }));
    expect(res.status).toBe(200);
    expect(cookieJar.get(VISITOR_COOKIE)).toMatch(/^[0-9a-f-]{36}$/);
    expect(cookieJar.get(SHARE_REF_COOKIE)).toBeTruthy();
    const unknown = await visitPost(req("/api/v1/builder-wrapped/visit", { method: "POST", body: JSON.stringify({ token: "x".repeat(43) }) }));
    expect(await unknown.json()).toMatchObject({ data: { recorded: false } });
  });

  it("restricts renderer endpoints to admins", async () => {
    resolveCallerMock.mockResolvedValue(caller("pilot"));
    expect((await adminJobsGet(req("/api/v1/builder-admin/render-jobs"))).status).toBe(403);
    resolveCallerMock.mockResolvedValue(caller("admin", "admin", "delegation"));
    expect((await adminJobsGet(req("/api/v1/builder-admin/render-jobs"))).status).toBe(403);
    // A full admin API key is refused; only a key bound to the builder:render scope drives the renderer.
    resolveCallerMock.mockResolvedValue({ ...caller("admin", "admin", "api_key"), apiKeyScopes: null });
    expect((await adminJobsGet(req("/api/v1/builder-admin/render-jobs"))).status).toBe(403);
    resolveCallerMock.mockResolvedValue({ ...caller("admin", "admin", "api_key"), apiKeyScopes: ["builder:render"] });
    expect((await adminJobsGet(req("/api/v1/builder-admin/render-jobs"))).status).toBe(200);
  });
});
