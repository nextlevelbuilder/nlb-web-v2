import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve4, resolve6 } from "node:dns/promises";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { probeProductWebsite } from "@/lib/moderation/pulse-probe";
import { readFileSync } from "node:fs";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ resolve4: vi.fn(), resolve6: vi.fn() }));
vi.mock("node:https", () => ({ request }));
vi.mock("node:http", () => ({ request }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn() }));

describe("Pulse runtime transports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolve4).mockResolvedValue(["93.184.215.14"] as never);
    vi.mocked(resolve6).mockResolvedValue([] as never);
    vi.mocked(getCloudflareContext).mockImplementation(() => { throw new Error("Node runtime"); });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps public-only egress and uncached probes enabled in each deployment environment", () => {
    const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")) as {
      compatibility_flags: string[]; env?: Record<string, { compatibility_flags?: string[] }>;
    };
    for (const flags of [config.compatibility_flags, ...Object.values(config.env || {}).map(env => env.compatibility_flags || config.compatibility_flags)]) {
      expect(flags).toContain("global_fetch_strictly_public");
      expect(flags).toContain("cache_option_enabled");
    }
  });
  it("pins local Node connections to vetted DNS addresses and preserves the hostname", async () => {
    const destroy = vi.fn();
    request.mockImplementation((_url, _options, onResponse) => ({
      once: vi.fn(), end: () => onResponse({ statusCode: 200, headers: {}, destroy }),
    }));
    expect(await probeProductWebsite("https://example.com/path")).toMatchObject({ outcome: "up", httpStatus: 200 });
    const [url, options] = request.mock.calls[0];
    expect(url.hostname).toBe("example.com");
    expect(options).toMatchObject({ method: "HEAD", agent: false });
    const callback = vi.fn();
    options.lookup("example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.215.14", family: 4 }]);
    expect(destroy).toHaveBeenCalled();
    expect(resolve4).toHaveBeenCalledTimes(1);
  });
  it("uses manual public Workers fetch, without credentials or incoming headers", async () => {
    vi.mocked(getCloudflareContext).mockReturnValue({ env: {} } as ReturnType<typeof getCloudflareContext>);
    const fetcher = vi.fn(async (_input: URL, _init: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await probeProductWebsite("https://example.com")).toMatchObject({ outcome: "up", httpStatus: 204 });
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: "HEAD", redirect: "manual", cache: "no-store" }));
    const init = fetcher.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(init?.headers).not.toHaveProperty("Cookie");
    expect(request).not.toHaveBeenCalled();
  });
  it("never invokes either transport after a private DNS response", async () => {
    vi.mocked(resolve4).mockResolvedValue(["10.1.2.3"] as never);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await probeProductWebsite("https://example.com")).toMatchObject({ outcome: "unknown", reason: "blocked_target" });
    expect(request).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
