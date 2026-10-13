import { register } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { defaultLocale, isLocale, locales, routing } from "@/i18n/routing";
import { defaultLocale as requestDefaultLocale, locales as requestLocales } from "@/i18n/request";

/*
 * next-intl ships ESM that imports `next/server` without an extension, which Node's native ESM
 * resolver (used for externalised node_modules under vitest) rejects. Map those bare Next.js
 * subpaths to their `.js` files for this test process only.
 */
const NEXT_SUBPATH_RESOLVER = `
export async function resolve(specifier, context, next) {
  if (/^next\\/(server|navigation|headers|link)$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(NEXT_SUBPATH_RESOLVER)}`);

let middleware: typeof import("@/middleware").default;
let config: typeof import("@/middleware").config;

beforeAll(async () => {
  ({ default: middleware, config } = await import("@/middleware"));
});

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "https://nextlevelbuilder.io"), { headers });
}

function redirectPath(response: Response) {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
}

describe("locale routing config", () => {
  it("defaults to English without a prefix and detects Vietnamese", () => {
    expect(defaultLocale).toBe("en");
    expect(locales).toEqual(["en", "vi"]);
    expect(routing.localePrefix).toBe("as-needed");
    expect(routing.localeDetection).toBe(true);
  });

  it("keeps the legacy @/i18n/request exports in sync", () => {
    expect(requestDefaultLocale).toBe(defaultLocale);
    expect(requestLocales).toEqual(locales);
  });

  it("validates locale strings", () => {
    expect(isLocale("vi")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("locale middleware", () => {
  it("serves English at / for English browsers", () => {
    const response = middleware(request("/", { "accept-language": "en-US,en;q=0.9" }));
    expect(redirectPath(response)).toBeNull();
  });

  it("redirects Vietnamese browsers from / to /vi", () => {
    const response = middleware(request("/", { "accept-language": "vi-VN,vi;q=0.9,en;q=0.5" }));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(redirectPath(response)).toBe("/vi");
  });

  it("sends old Vietnamese deep links to the same page under /vi", () => {
    const response = middleware(request("/policies/ship-policy", { "accept-language": "vi" }));
    expect(redirectPath(response)).toBe("/vi/policies/ship-policy");
  });

  it("honours an explicit English cookie over a Vietnamese browser", () => {
    const response = middleware(request("/policies/ship-policy", { "accept-language": "vi", cookie: "NEXT_LOCALE=en" }));
    expect(redirectPath(response)).toBeNull();
  });

  it("redirects legacy /en links to the unprefixed English path", () => {
    const response = middleware(request("/en/policies/terms", { "accept-language": "en" }));
    expect(redirectPath(response)).toBe("/policies/terms");
  });

  it("rewrites markdown twins to the markdown API", () => {
    const response = middleware(request("/vi/products/tool.md"));
    const rewrite = response.headers.get("x-middleware-rewrite");
    expect(rewrite).toContain("/api/markdown");
    expect(rewrite).toContain(encodeURIComponent("/vi/products/tool.md"));
  });

  it("does not match api, go redirects or root docs routes", () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test("/api/checkout")).toBe(false);
    expect(pattern.test("/go/agentkit")).toBe(false);
    expect(pattern.test("/docs/api")).toBe(false);
    expect(pattern.test("/llms.txt")).toBe(false);
    expect(pattern.test("/policies/terms")).toBe(true);
    expect(pattern.test("/vi")).toBe(true);
  });
});
