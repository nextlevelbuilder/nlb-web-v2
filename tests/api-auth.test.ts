import { describe, it, expect, vi } from "vitest";
import { POST as createProductPost } from "@/app/api/v1/products/route";
import { POST as decidePost } from "@/app/api/v1/admin/decide/route";
import { GET as queueGet } from "@/app/api/v1/admin/queue/route";

describe("REST API v1 Authentication & Role Authorization", () => {
  it("should return 401 Unauthorized for unauthenticated product draft creation", async () => {
    const req = new Request("http://localhost:3000/api/v1/products", {
      method: "POST",
      body: JSON.stringify({
        orgId: "org-1",
        slug: "test-product",
        title: "Test",
        tagline: "Test",
        websiteUrl: "https://test.com",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await createProductPost(req);
    expect(res.status).toBe(401);
  });

  it("should return 401 Unauthorized for unauthenticated admin queue inspect", async () => {
    const req = new Request("http://localhost:3000/api/v1/admin/queue", {
      method: "GET",
    });

    const res = await queueGet(req);
    expect(res.status).toBe(401);
  });

  it("should return 401 Unauthorized for unauthenticated moderation decision", async () => {
    const req = new Request("http://localhost:3000/api/v1/admin/decide", {
      method: "POST",
      body: JSON.stringify({
        caseId: "a0000000-0000-0000-0000-000000000001",
        decision: "approved",
        reasonCodes: ["verified"],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await decidePost(req);
    expect(res.status).toBe(401);
  });
});
