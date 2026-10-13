import { describe, expect, it, vi } from "vitest";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { getAllPublishedProducts, getPublishedProductBySlug, getPublishedProducts, publishedProductProjection, projectDashboardProductTrust } from "@/lib/domain/catalog";
import type { AppDb } from "@/lib/db";
import type { products, productRevisions } from "@/lib/db/schema";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

const publishedAt = new Date("2026-08-01T00:00:00Z");
const product = { id: "p1", slug: "tool", title: "Private draft", tagline: "Private draft tagline", websiteUrl: "https://draft.test", logoUrl: "https://draft.test/logo", status: "published", currentRevisionId: "draft", createdAt: publishedAt, trustScore: 5, updatedAt: new Date("2026-09-01T00:00:00Z") } as typeof products.$inferSelect;
const revision = { id: "approved", productId: "p1", title: "Public title", tagline: "Public tagline", status: "approved", revisionNumber: 1, createdAt: publishedAt, document: { title: "Public title", websiteUrl: "https://public.test", blocks: [] } } as typeof productRevisions.$inferSelect;

function database(batches: unknown[][]) {
  const calls: { method: string; values: unknown[] }[] = [];
  let index = 0;
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "from", "where", "limit", "offset", "orderBy", "innerJoin"]) chain[method] = (...values: unknown[]) => { calls.push({ method, values }); return chain; };
  chain.then = (resolve: (value: unknown) => void) => Promise.resolve(batches[index++] || []).then(resolve);
  return { db: chain as unknown as AppDb, calls };
}

describe("Published catalog boundary", () => {
  it("scores the approved website rather than an unpublished draft URL", () => {
    const at = publishedAt.getTime() + 14 * 86_400_000;
    const result = publishedProductProjection({ ...product, websiteUrl: "http://draft.test" }, revision, at);
    expect(result).toMatchObject({ trustScore: 74, votesCount: 5, websiteUrl: "https://public.test" });
  });

  it("scores legacy nested website metadata without treating the stored counter as a score", () => {
    const at = publishedAt.getTime() + 14 * 86_400_000;
    const legacy = { ...revision, document: JSON.stringify({ metadata: { websiteUrl: "https://legacy.test" }, blocks: [] }) };
    const result = publishedProductProjection({ ...product, websiteUrl: "http://draft.test" }, legacy, at);
    expect(result).toMatchObject({ trustScore: 74, votesCount: 5, websiteUrl: "https://legacy.test" });
  });

  it("keeps editable dashboard metadata but uses the same published trust score", async () => {
    const editedProduct = { ...product, websiteUrl: "http://draft.test" };
    const { db, calls } = database([[{ product: editedProduct, revision }]]);
    const [dashboard] = await projectDashboardProductTrust([editedProduct], db);
    expect(dashboard.title).toBe("Private draft");
    expect(dashboard.websiteUrl).toBe("http://draft.test");
    expect(dashboard.trustScore).toBe(publishedProductProjection(editedProduct, revision).trustScore);
    expect(editedProduct.trustScore).toBe(5);
    const filters = calls.find((call) => call.method === "where")!;
    expect(new SQLiteSyncDialect().sqlToQuery(filters.values[0] as Parameters<SQLiteSyncDialect["sqlToQuery"]>[0]).params).toContain("p1");
  });

  it("does not load public revisions for an empty or draft-only dashboard", async () => {
    const { db, calls } = database([]);
    expect(await projectDashboardProductTrust([], db)).toEqual([]);
    const [draft] = await projectDashboardProductTrust([{ ...product, status: "draft" }], db);
    expect(draft.trustScore).toBeLessThanOrEqual(40);
    expect(calls).toHaveLength(0);
  });
  it("projects approved metadata even after a draft overwrites the mutable product row", () => {
    const result = publishedProductProjection(product, revision);
    expect(result).toMatchObject({ title: "Public title", tagline: "Public tagline", websiteUrl: "https://public.test", currentRevisionId: "approved", logoUrl: null, updatedAt: publishedAt });
    expect(result).not.toHaveProperty("publishedDocument");
    expect(JSON.stringify(result)).not.toContain("Private draft");
  });

  it.each(["approved", "published"])("selects a %s revision belonging to the product instead of the draft pointer", async (status) => {
    const { db, calls } = database([[product], [{ ...revision, status }]]);
    const result = await getPublishedProductBySlug("tool", db);
    const filters = calls.filter((call) => call.method === "where").map((call) => new SQLiteSyncDialect().sqlToQuery(call.values[0] as Parameters<SQLiteSyncDialect["sqlToQuery"]>[0]));
    expect(filters[1].params).toEqual(["p1", "approved", "published"]);
    expect(filters[1].sql).toContain('"status" in');
    expect(filters[1].sql).toContain('"product_id"');
    expect(result?.revision.id).toBe("approved");
    expect(result?.product.title).toBe("Public title");
  });

  it("does not publish a product without any approved revision", async () => {
    const { db } = database([[product], []]);
    expect(await getPublishedProductBySlug("tool", db)).toBeNull();
  });

  it("filters list metadata through approved revisions without changing response shape", async () => {
    const { db, calls } = database([[{ product, revision }]]);
    const list = await getPublishedProducts({ limit: 20 }, db);
    const join = calls.find((call) => call.method === "innerJoin")!;
    const sql = new SQLiteSyncDialect().sqlToQuery(join.values[1] as Parameters<SQLiteSyncDialect["sqlToQuery"]>[0]).sql;
    expect(sql).toContain("approved.status in ('approved', 'published')");
    expect(sql).toContain("approved.product_id");
    expect(list[0].websiteUrl).toBe("https://public.test");
    expect(list[0]).not.toHaveProperty("publishedDocument");
  });

  it("traverses beyond 100 products until the final partial page", async () => {
    const row = { product, revision };
    const { db, calls } = database([Array.from({ length: 100 }, () => row), Array.from({ length: 100 }, () => row), [row]]);
    const all = await getAllPublishedProducts(db);
    expect(all).toHaveLength(201);
    expect(calls.filter((call) => call.method === "offset").map((call) => call.values[0])).toEqual([0, 100, 200]);
    expect(all[200].publishedDocument.websiteUrl).toBe("https://public.test");
  });
});
