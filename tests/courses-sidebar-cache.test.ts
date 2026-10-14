import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { cachedSidebarLoad, clearSidebarMemoryCache, SIDEBAR_CACHE_ORIGIN, SIDEBAR_FRESH_TTL_MS } from "@/lib/courses/sidebar/sidebar-cache";

const schema = z.array(z.string());

describe("cachedSidebarLoad", () => {
  let now = 1_000_000;
  const clock = () => now;

  beforeEach(() => {
    clearSidebarMemoryCache();
    now = 1_000_000;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads fresh, then serves the cached value within the TTL", async () => {
    const load = vi.fn(async () => ["a"]);
    expect(await cachedSidebarLoad({ key: "k1", schema, load, now: clock })).toEqual(["a"]);
    now += SIDEBAR_FRESH_TTL_MS - 1;
    expect(await cachedSidebarLoad({ key: "k1", schema, load, now: clock })).toEqual(["a"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refreshes after the TTL and serves stale data when the refresh fails", async () => {
    await cachedSidebarLoad({ key: "k2", schema, load: async () => ["old"], now: clock });
    now += SIDEBAR_FRESH_TTL_MS + 1;
    expect(await cachedSidebarLoad({ key: "k2", schema, load: async () => ["new"], now: clock })).toEqual(["new"]);
    now += SIDEBAR_FRESH_TTL_MS + 1;
    const failing = vi.fn(async (): Promise<string[]> => { throw new Error("source down"); });
    expect(await cachedSidebarLoad({ key: "k2", schema, load: failing, now: clock })).toEqual(["new"]);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("returns null when the source fails and nothing is cached, or the payload is invalid", async () => {
    expect(await cachedSidebarLoad({ key: "k3", schema, load: async () => { throw new Error("down"); }, now: clock })).toBeNull();
    expect(await cachedSidebarLoad({ key: "k4", schema, load: async () => [1] as unknown as string[], now: clock })).toBeNull();
  });

  it("shares one refresh between concurrent callers", async () => {
    const load = vi.fn(async () => ["x"]);
    const [a, b] = await Promise.all([cachedSidebarLoad({ key: "k5", schema, load, now: clock }), cachedSidebarLoad({ key: "k5", schema, load, now: clock })]);
    expect(a).toEqual(["x"]);
    expect(b).toEqual(["x"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("uses caches.default when present and survives a cold isolate", async () => {
    const store = new Map<string, string>();
    const edge = {
      match: vi.fn(async (key: string) => (store.has(key) ? new Response(store.get(key)) : undefined)),
      put: vi.fn(async (key: string, res: Response) => { store.set(key, await res.text()); }),
    };
    vi.stubGlobal("caches", { default: edge });

    await cachedSidebarLoad({ key: "k6", schema, load: async () => ["edge"], now: clock });
    expect(edge.put).toHaveBeenCalledWith(`${SIDEBAR_CACHE_ORIGIN}k6`, expect.any(Response));

    clearSidebarMemoryCache(); // new isolate: memory is empty, the colo cache is not
    const load = vi.fn(async () => ["unused"]);
    expect(await cachedSidebarLoad({ key: "k6", schema, load, now: clock })).toEqual(["edge"]);
    expect(load).not.toHaveBeenCalled();

    store.set(`${SIDEBAR_CACHE_ORIGIN}k7`, "{corrupt");
    expect(await cachedSidebarLoad({ key: "k7", schema, load: async () => ["fresh"], now: clock })).toEqual(["fresh"]);
  });
});
