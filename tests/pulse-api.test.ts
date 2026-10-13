import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/v1/products/[slug]/pulse/route";
import { getProductPulse, sampleProductPulse } from "@/lib/domain/product-pulse";

vi.mock("@/lib/domain/product-pulse", () => ({ getProductPulse: vi.fn(), sampleProductPulse: vi.fn() }));
const context = () => ({ params: Promise.resolve({ slug: "example" }) });
const url = "https://nextlevelbuilder.io/api/v1/products/example/pulse";

describe("Pulse public API", () => {
  beforeEach(() => vi.resetAllMocks());
  it("keeps GET read-only and returns 404 for non-public/non-Pulse products", async () => {
    vi.mocked(getProductPulse).mockResolvedValue(null);
    const response = await GET(new Request(url), context());
    expect(response.status).toBe(404);
    expect(sampleProductPulse).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects arbitrary target URLs in the POST body before sampling", async () => {
    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify({ url: "http://localhost" }) }), context());
    expect(response.status).toBe(400);
    expect(sampleProductPulse).not.toHaveBeenCalled();
  });
  it("rejects cross-origin browser triggers", async () => {
    const response = await POST(new Request(url, { method: "POST", headers: { Origin: "https://attacker.example" } }), context());
    expect(response.status).toBe(403);
    expect(sampleProductPulse).not.toHaveBeenCalled();
  });
  it("samples only the route product and supports bodyless same-origin requests", async () => {
    vi.mocked(sampleProductPulse).mockResolvedValue(null);
    expect((await POST(new Request(url, { method: "POST", headers: { Origin: "https://nextlevelbuilder.io" } }), context())).status).toBe(404);
    expect(sampleProductPulse).toHaveBeenCalledWith("example");
  });
  it("accepts the empty POST stream used by Next's Node request adapter", async () => {
    vi.mocked(sampleProductPulse).mockResolvedValue(null);
    const request = new Request(url, { method: "POST", body: new ReadableStream({ start(controller) { controller.close(); } }), duplex: "half" } as RequestInit);
    expect((await POST(request, context())).status).toBe(404);
    expect(sampleProductPulse).toHaveBeenCalledWith("example");
  });
  it("does not expose database or internal network errors", async () => {
    vi.mocked(getProductPulse).mockRejectedValue(new Error("postgres://private-password@database"));
    const response = await GET(new Request(url), context());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-password");
  });
});
