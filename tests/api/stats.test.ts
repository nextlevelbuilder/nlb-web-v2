import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "@/lib/db";
import { GET } from "@/app/api/v1/stats/route";

describe("GET /api/v1/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns live directory metrics payload with caching headers on success", async () => {
    (getDb as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
          then: (resolve: any) => resolve([{ count: 12 }]),
        }),
      }),
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.stats).toBeDefined();
    expect(typeof data.stats.publishedCount).toBe("number");
    expect(typeof data.stats.outboundClicks).toBe("number");
    expect(typeof data.stats.registeredBuilders).toBe("number");
    expect(typeof data.stats.totalVotes).toBe("number");
    expect(res.headers.get("Cache-Control")).toContain("public, s-maxage=60");
  });

  it("returns HTTP 500 with stats: null when database fails", async () => {
    (getDb as any).mockImplementation(() => {
      throw new Error("DB connection timeout");
    });

    const res = await GET();
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.stats).toBeNull();
    expect(data.error).toBe("Directory stats temporarily unavailable");
  });
});
