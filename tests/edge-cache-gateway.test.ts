import { describe, expect, it } from "vitest";
import { preferredLocale, toEdgeCacheRequest, unprefixedLocale } from "@/lib/edge-cache-gateway";

const ORIGIN = "https://nextlevelbuilder.io";

function request(path: string, headers: Record<string, string> = {}, method = "GET"): Request {
  return new Request(`${ORIGIN}${path}`, { method, headers });
}

describe("preferredLocale", () => {
  it("picks the highest-ranked site locale", () => {
    expect(preferredLocale("en-US,en;q=0.9")).toBe("en");
    expect(preferredLocale("vi-VN,vi;q=0.9,en-US;q=0.8")).toBe("vi");
    expect(preferredLocale("fr-FR,en;q=0.5,vi;q=0.7")).toBe("vi");
    expect(preferredLocale("*")).toBe("en");
  });

  it("returns null when no site locale is named", () => {
    expect(preferredLocale("")).toBeNull();
    expect(preferredLocale("fr,de;q=0.8")).toBeNull();
    expect(preferredLocale("vi;q=0")).toBeNull();
  });
});

describe("unprefixedLocale", () => {
  it("lets the NEXT_LOCALE cookie win over Accept-Language", () => {
    expect(unprefixedLocale(request("/", { Cookie: "NEXT_LOCALE=en", "Accept-Language": "vi" }))).toBe("en");
    expect(unprefixedLocale(request("/", { Cookie: "_ga=1; NEXT_LOCALE=vi", "Accept-Language": "en" }))).toBe("vi");
  });

  it("falls back to Accept-Language, then English", () => {
    expect(unprefixedLocale(request("/", { "Accept-Language": "vi-VN" }))).toBe("vi");
    expect(unprefixedLocale(request("/"))).toBe("en");
  });
});

describe("toEdgeCacheRequest", () => {
  it("strips visitor cookies and pins Accept-Language so every visitor shares one entry", () => {
    const forwarded = toEdgeCacheRequest(request("/blog", { Cookie: "_ga=GA1.1.1; ph_x_posthog=abc", "Accept-Language": "en-US,en;q=0.9", RSC: "1" }));
    expect(forwarded?.headers.get("Cookie")).toBeNull();
    expect(forwarded?.headers.get("Accept-Language")).toBe("en");
    expect(forwarded?.headers.get("RSC")).toBe("1");
  });

  it("pins Vietnamese on /vi paths whatever the browser prefers", () => {
    const forwarded = toEdgeCacheRequest(request("/vi/mcp-server", { "Accept-Language": "en", Cookie: "NEXT_LOCALE=en" }));
    expect(forwarded?.headers.get("Accept-Language")).toBe("vi");
    expect(forwarded?.headers.get("Cookie")).toBeNull();
  });

  it("leaves unprefixed requests that next-intl redirects to /vi uncached", () => {
    expect(toEdgeCacheRequest(request("/", { "Accept-Language": "vi-VN,vi;q=0.9" }))).toBeNull();
    expect(toEdgeCacheRequest(request("/courses", { Cookie: "NEXT_LOCALE=vi" }))).toBeNull();
  });

  it("leaves signed-in visitors, personalised paths and writes uncached", () => {
    expect(toEdgeCacheRequest(request("/", { Cookie: "__Secure-better-auth.session_token=t" }))).toBeNull();
    expect(toEdgeCacheRequest(request("/account"))).toBeNull();
    expect(toEdgeCacheRequest(request("/blog", {}, "POST"))).toBeNull();
  });
});
