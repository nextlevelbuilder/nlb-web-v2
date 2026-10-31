import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { affiliateLinkClicks } from "@/lib/db/schema";
import { GET } from "@/app/r/[code]/route";
import { updateLink } from "@/lib/referrals/affiliate-links";
import { seedAffiliateWithLink } from "./referral-fixtures";

const call = (code: string, headers: Record<string, string> = {}) =>
  GET(new Request(`https://nextlevelbuilder.io/r/${code}`, { headers }), { params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.stubEnv("AFFILIATES_ENABLED", "true");
  vi.stubEnv("TRAFFIC_HASH_SECRET", "x".repeat(40));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/r/<code>", () => {
  it("redirects to the landing page with ref and UTM tags and sets the referral cookie", async () => {
    const { affiliate, link } = await seedAffiliateWithLink(0);
    await updateLink(getDb(), affiliate, link.id, { destinationPath: "/vi/courses#pricing", utmCampaign: "launch" });
    const response = await call(link.code);
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/vi/courses");
    expect(location.hash).toBe("#pricing");
    expect(Object.fromEntries(location.searchParams)).toEqual({ ref: link.code, utm_source: "affiliate", utm_medium: "referral", utm_campaign: "launch" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(new RegExp(`nlb_aff=${link.code}\\.\\d+`));
    expect(cookies).toContain("HttpOnly");
    const clicks = await getDb().select().from(affiliateLinkClicks).where(eq(affiliateLinkClicks.linkId, link.id));
    expect(clicks).toHaveLength(1);
  });

  it("honours GPC and DNT: no cookies, no click count, the ref still travels", async () => {
    const { link } = await seedAffiliateWithLink(0);
    for (const headers of [{ "sec-gpc": "1" }, { dnt: "1" }] as Record<string, string>[]) {
      const response = await call(link.code, headers);
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).searchParams.get("ref")).toBe(link.code);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    const clicks = await getDb().select().from(affiliateLinkClicks).where(eq(affiliateLinkClicks.linkId, link.id));
    expect(clicks).toHaveLength(0);
  });

  it("sends unknown or paused codes home and is a 404 while the program is off", async () => {
    const { affiliate, link } = await seedAffiliateWithLink(0);
    await updateLink(getDb(), affiliate, link.id, { status: "paused" });
    const paused = await call(link.code);
    expect(new URL(paused.headers.get("location")!).pathname).toBe("/");
    expect(paused.headers.getSetCookie()).toEqual([]);
    expect(new URL((await call("does-not-exist")).headers.get("location")!).search).toBe("");
    vi.stubEnv("AFFILIATES_ENABLED", "false");
    expect((await call(link.code)).status).toBe(404);
  });
});
