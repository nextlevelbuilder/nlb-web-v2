import { describe, expect, it } from "vitest";
import { applyEdgeCachePolicy, isPublicPagePath } from "@/lib/edge-cache-policy";

const ORIGIN = "https://nextlevelbuilder.io";

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, init);
}

function html(init: ResponseInit = {}): Response {
  return new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" }, ...init });
}

describe("isPublicPagePath", () => {
  it("allows public pages in both locales", () => {
    for (const path of ["/", "/vi", "/blog", "/vi/blog/my-post", "/courses", "/policies/terms", "/products/claudekit", "/vi/mcp-server"]) {
      expect(isPublicPagePath(path), path).toBe(true);
    }
  });

  it("rejects personalised, API and markdown-twin paths", () => {
    for (const path of ["/account", "/vi/account", "/courses/intro", "/leaderboards", "/live", "/api/v1/stats", "/blog/my-post.md", "/mcp", "/vietnam"]) {
      expect(isPublicPagePath(path), path).toBe(false);
    }
  });
});

describe("applyEdgeCachePolicy", () => {
  it("makes anonymous public renders shared-cacheable and keeps the RSC Vary", () => {
    const response = applyEdgeCachePolicy(request("/vi"), html({ headers: { Vary: "RSC, Next-Router-State-Tree" } }));
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300");
    expect(response.headers.get("Vary")).toBe("RSC, Next-Router-State-Tree");
  });

  it("varies unprefixed pages on the locale inputs that drive the /vi redirect", () => {
    const response = applyEdgeCachePolicy(request("/courses"), html({ headers: { Vary: "RSC, accept-language" } }));
    expect(response.headers.get("Vary")).toBe("RSC, accept-language, Cookie");
  });

  it("overrides the private Cache-Control Next sets on public pages", () => {
    const response = applyEdgeCachePolicy(request("/blog"), html({ headers: { "Cache-Control": "private, no-store" } }));
    expect(response.headers.get("Cache-Control")).toContain("public");
  });

  it("never shares a render made for a signed-in request", () => {
    for (const cookie of ["better-auth.session_token=abc", "theme=dark; __Secure-better-auth.session_token=abc"]) {
      const response = applyEdgeCachePolicy(request("/", { headers: { Cookie: cookie } }), html());
      expect(response.headers.get("Cache-Control"), cookie).toBe("private, no-store");
    }
  });

  it("does not cache responses that set cookies, non-200 statuses or non-GET methods", () => {
    expect(applyEdgeCachePolicy(request("/"), html({ headers: { "Set-Cookie": "NEXT_LOCALE=en" } })).headers.get("Cache-Control")).toBe("private, no-store");
    expect(applyEdgeCachePolicy(request("/"), new Response(null, { status: 307, headers: { Location: "/vi" } })).headers.get("Cache-Control")).toBe("private, no-store");
    expect(applyEdgeCachePolicy(request("/blog/missing"), html({ status: 404 })).headers.get("Cache-Control")).toBe("private, no-store");
    expect(applyEdgeCachePolicy(request("/", { method: "POST" }), html()).headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("marks other responses no-store so the edge does not cache them heuristically", () => {
    const response = applyEdgeCachePolicy(request("/account"), html());
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBeNull();
  });

  it("keeps an explicit Cache-Control on routes outside the allowlist", () => {
    const original = new Response("{}", { headers: { "Cache-Control": "public, max-age=300" } });
    expect(applyEdgeCachePolicy(request("/api/chat/status"), original)).toBe(original);
  });

  it("preserves status, body and other headers when rebuilding", async () => {
    const response = applyEdgeCachePolicy(request("/account"), new Response("hi", { status: 201, statusText: "Created", headers: { "X-Test": "1" } }));
    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(response.headers.get("X-Test")).toBe("1");
    expect(await response.text()).toBe("hi");
  });
});
