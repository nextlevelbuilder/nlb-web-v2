import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "./helpers/local-d1";
import { organizations, products, productPulseMonitors, productPulseSamples } from "@/lib/db/schema";
import { getPublishedProductBySlug } from "@/lib/domain/catalog";
import { PULSE_COOLDOWN_MS, getProductPulse, reservePulseCheck, sampleProductPulse, summarizePulse, type PulseSample } from "@/lib/domain/product-pulse";
import { probeProductWebsite } from "@/lib/moderation/pulse-probe";
import type { AppDb } from "@/lib/db";

vi.mock("@/lib/domain/catalog", () => ({ getPublishedProductBySlug: vi.fn() }));
vi.mock("@/lib/moderation/pulse-probe", () => ({ probeProductWebsite: vi.fn() }));

const now = new Date("2026-09-12T12:00:00.000Z");
const sample = (outcome: PulseSample["outcome"], checkedAt = now.toISOString()): PulseSample => ({ outcome, checkedAt, latencyMs: outcome === "unknown" ? null : 123, httpStatus: outcome === "up" ? 200 : null, reason: null });

// Database-boundary doubles keep the tested reservation decisions and queries in
// the real service. They do not replace the service with a test implementation.
function database(rows: unknown[][]) {
  const pending = [...rows];
  const insert = vi.fn();
  const execute = vi.fn().mockResolvedValue([]);
  const conflict = vi.fn().mockResolvedValue([]);
  const values = vi.fn(() => ({ onConflictDoUpdate: conflict, then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve) }));
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) }));
  insert.mockReturnValue({ values });
  const db = {
    execute, insert, update: vi.fn(() => ({ set })),
    select: vi.fn(() => {
      const result = pending.shift() || [];
      const chain = {
        from: vi.fn(() => chain), where: vi.fn(() => chain), orderBy: vi.fn(() => chain),
        limit: vi.fn(async () => result), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    }),
    transaction: vi.fn(async (work: (tx: unknown) => unknown) => work(db)),
  };
  return { db: db as unknown as AppDb, insert, execute, values, conflict, set };
}

describe("Pulse summaries", () => {
  it("keeps missing samples unknown and has no synthetic uptime", () => {
    expect(summarizePulse("https://example.com", [], null, now)).toMatchObject({ status: "unknown", sampleUptimePercent: null, checkedAt: null, sampleCount: 0 });
  });
  it("excludes unknown checks and computes the percentage from actual measured samples", () => {
    const summary = summarizePulse("https://example.com", [sample("up"), sample("down"), sample("unknown")], null, now);
    expect(summary).toMatchObject({ sampleUptimePercent: 50, sampleCount: 3, measuredSampleCount: 2 });
  });
  it("marks old results stale without rewriting their historical measurements", () => {
    const summary = summarizePulse("https://example.com", [sample("up", "2026-09-12T11:00:00.000Z")], null, now);
    expect(summary.status).toBe("stale");
    expect(summary.history[0].outcome).toBe("up");
    expect(summary.sampleUptimePercent).toBe(100);
  });
  it("bounds history and derives current status from the newest sample", () => {
    const entries = Array.from({ length: 110 }, (_, index) => sample("down", new Date(now.getTime() - (index + 1) * 1000).toISOString()));
    entries.push(sample("up"));
    expect(summarizePulse("https://example.com", entries, null, now)).toMatchObject({ status: "up", sampleCount: 100, sampleUptimePercent: 1 });
  });
});

describe("Pulse sampling service", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects products outside the published projection without reading history or probing", async () => {
    vi.mocked(getPublishedProductBySlug).mockResolvedValue(null);
    const { db, insert } = database([]);
    expect(await getProductPulse("draft", db)).toBeNull();
    expect(await sampleProductPulse("draft", db)).toBeNull();
    expect(insert).not.toHaveBeenCalled();
    expect(probeProductWebsite).not.toHaveBeenCalled();
  });
});

// The reservation and history pruning are SQL; exercise them against a real local D1.
describe("Pulse reservations on D1", () => {
  let local: LocalD1;
  const t0 = now.getTime();

  async function seedProducts(count: number) {
    const ids = Array.from({ length: count }, (_, i) => `p${i}`);
    await local.db.insert(organizations).values({ id: "org", name: "Org", slug: "org" });
    await local.db.insert(products).values(ids.map((id) => ({
      id, orgId: "org", slug: id, title: id, tagline: "t", websiteUrl: `https://${id}.example.com`, status: "published",
    })));
    return ids;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    local = await createLocalD1();
  });
  afterEach(async () => { await local.dispose(); });

  it("returns immediately on an existing cooldown without reserving another check", async () => {
    await seedProducts(1);
    expect(await reservePulseCheck("p0", local.db, t0)).toBe(true);
    expect(await reservePulseCheck("p0", local.db, t0 + 1000)).toBe(false);
    expect(await reservePulseCheck("p0", local.db, t0 + PULSE_COOLDOWN_MS + 1)).toBe(true);
  });

  it("does not exceed the global four-check concurrency limit", async () => {
    const ids = await seedProducts(5);
    const results = [];
    for (const id of ids) results.push(await reservePulseCheck(id, local.db, t0));
    expect(results).toEqual([true, true, true, true, false]);
    const [monitor] = await local.db.select().from(productPulseMonitors).where(eq(productPulseMonitors.productId, "p4"));
    expect(monitor).toBeUndefined();
  });

  it("reserves a durable product cooldown and lease", async () => {
    await seedProducts(1);
    expect(await reservePulseCheck("p0", local.db, t0)).toBe(true);
    const [monitor] = await local.db.select().from(productPulseMonitors);
    expect(monitor.nextCheckAt.getTime()).toBe(t0 + PULSE_COOLDOWN_MS);
    expect(monitor.leaseUntil.getTime()).toBeGreaterThan(t0);
  });

  it("uses only the saved published website, persists its result, and releases the lease", async () => {
    await seedProducts(1);
    vi.mocked(getPublishedProductBySlug).mockResolvedValue({ product: { id: "p0", websiteUrl: "https://draft.example.com" }, revision: { document: {
      title: "Product", tagline: "Tagline", description: "Published product description", websiteUrl: "https://published.example.com", categorySlugs: ["ai-tools"], blocks: [{ id: "pulse", type: "pulse", props: {} }],
    } } } as unknown as NonNullable<Awaited<ReturnType<typeof getPublishedProductBySlug>>>);
    vi.mocked(probeProductWebsite).mockResolvedValue({ outcome: "up", latencyMs: 24, httpStatus: 200, reason: null });
    const result = await sampleProductPulse("product", local.db);
    expect(probeProductWebsite).toHaveBeenCalledWith("https://published.example.com");
    const samples = await local.db.select().from(productPulseSamples);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ websiteUrl: "https://published.example.com", outcome: "up", latencyMs: 24 });
    const [monitor] = await local.db.select().from(productPulseMonitors);
    expect(monitor.leaseUntil.getTime()).toBeLessThanOrEqual(Date.now());
    expect(result?.sampled).toBe(true);
    expect(result?.data.websiteUrl).toBe("https://published.example.com");
  });
});
