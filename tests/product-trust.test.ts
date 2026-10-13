import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { desc } from "drizzle-orm";
import { calculateTrustScore, getProductTrustFactors, projectProductTrust } from "@/lib/domain/trust";
import { productTrustScoreOrder } from "@/lib/domain/product-trust-order";
import { products } from "@/lib/db/schema";
import type { AppDb } from "@/lib/db";

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => { throw new Error("Unexpected database access"); }) }));
vi.mock("@/lib/polar", () => ({ PRODUCT_IDS: {} }));

import { getPublishedProductBySlug, getPublishedProducts } from "@/lib/domain/catalog";

const now = Date.parse("2026-09-12T00:00:00Z");
const day = 86_400_000;
const rawProduct = {
  id: "product-1", slug: "example", title: "Example", tagline: "A product",
  status: "published", websiteUrl: "https://example.com",
  createdAt: new Date(now - 14 * day), trustScore: 5,
  currentRevisionId: "revision-1", isFeatured: false,
};
const publicRevision = {
  id: "revision-1", title: rawProduct.title, tagline: rawProduct.tagline,
  createdAt: rawProduct.createdAt, document: { websiteUrl: rawProduct.websiteUrl },
};

afterEach(() => vi.useRealTimers());

describe("Product Trust Passport projection", () => {
  it("separates the vote counter from the public score without mutating the row", () => {
    const result = projectProductTrust(rawProduct, now);
    expect(result).toMatchObject({ trustScore: 74, votesCount: 5, slug: "example" });
    expect(rawProduct.trustScore).toBe(5);
    expect(rawProduct).not.toHaveProperty("votesCount");
    expect(getProductTrustFactors(result, now).activeVotesCount).toBe(5);
    expect(calculateTrustScore(getProductTrustFactors(result, now))).toBe(result.trustScore);
  });

  it.each([
    [0, 0], [6, 0], [7, 2], [13, 2], [14, 4], [34, 8], [35, 10], [365, 10], [-7, 0],
  ])("grants the expected age contribution for %i days", (days, points) => {
    expect(projectProductTrust({ ...rawProduct, trustScore: 0, createdAt: new Date(now - days * day) }, now).trustScore)
      .toBe(60 + points);
  });

  it.each([[0, 0], [1, 2], [9, 18], [10, 20], [101, 20], [2147483647, 20], [-5, 0]])(
    "caps the contribution from %i votes", (votes, points) => {
      expect(projectProductTrust({ ...rawProduct, trustScore: votes }, now).trustScore).toBe(64 + points);
    },
  );

  it("caps currently available evidence at 90 and ignores editorial/payment fields", () => {
    const row = { ...rawProduct, trustScore: 500, createdAt: new Date(now - 365 * day) };
    expect(projectProductTrust(row, now).trustScore).toBe(90);
    expect(projectProductTrust({ ...row, isFeatured: true, paymentStatus: "paid" }, now).trustScore).toBe(90);
    expect(getProductTrustFactors(projectProductTrust(row, now), now).verifiedRevenueOrPreorders).toBe(false);
  });

  it("does not grant approval to drafts or HTTPS points to HTTP URLs", () => {
    expect(projectProductTrust({ ...rawProduct, status: "draft" }, now).trustScore).toBe(34);
    expect(projectProductTrust({ ...rawProduct, websiteUrl: "http://example.com" }, now).trustScore).toBe(54);
  });

  it("updates vote points from the separate counter, including the cap", () => {
    for (const [before, expected] of [[5, 76], [9, 84], [10, 84]]) {
      const product = projectProductTrust({ ...rawProduct, trustScore: before }, now);
      const updated = { ...product, votesCount: product.votesCount + 1 };
      expect(calculateTrustScore(getProductTrustFactors(updated, now))).toBe(expected);
    }
  });
});

describe("Catalog score consistency", () => {
  function queryReturning(rows: unknown[]) {
    const query = {
      from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), offset: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return query;
  }

  it("returns the same calculated score and vote count for catalog lists and details", async () => {
    vi.useFakeTimers().setSystemTime(now);
    const listQuery = queryReturning([{ product: rawProduct, revision: publicRevision }]);
    const listDb = { select: vi.fn(() => listQuery) } as unknown as AppDb;
    const productQuery = queryReturning([rawProduct]);
    const revisionQuery = queryReturning([publicRevision]);
    const detailDb = { select: vi.fn().mockReturnValueOnce(productQuery).mockReturnValueOnce(revisionQuery) } as unknown as AppDb;

    const [listed] = await getPublishedProducts({ limit: 1, offset: 2 }, listDb);
    const detailed = await getPublishedProductBySlug("example", detailDb);
    expect(listed).toMatchObject({ trustScore: 74, votesCount: 5 });
    expect(detailed?.product).toEqual(listed);
    expect(listQuery.limit).toHaveBeenCalledWith(1);
    expect(listQuery.offset).toHaveBeenCalledWith(2);
    const orderedBy = new SQLiteSyncDialect().sqlToQuery(listQuery.orderBy.mock.calls[0][0]);
    expect(orderedBy.sql).toContain("min(");
    expect(orderedBy.sql).toContain('"products"."created_at"');
    expect(orderedBy.sql).toContain('"product_revisions"."document"');
    expect(orderedBy.sql).toContain("'$.metadata.websiteUrl'");
    expect(orderedBy.sql).toContain("json_type");
    expect(orderedBy.sql).not.toContain('"products"."website_url"');
    expect(orderedBy.params).toContain(now);
  });

  it("keeps missing products and missing revisions absent", async () => {
    const emptyDb = { select: vi.fn(() => queryReturning([])) } as unknown as AppDb;
    expect(await getPublishedProductBySlug("missing", emptyDb)).toBeNull();
    const noRevisionDb = {
      select: vi.fn().mockReturnValueOnce(queryReturning([rawProduct])).mockImplementation(() => queryReturning([])),
    } as unknown as AppDb;
    expect(await getPublishedProductBySlug("example", noRevisionDb)).toBeNull();
  });

  it("orders by calculated evidence before database pagination with deterministic ties", () => {
    const db = drizzle(new Database(":memory:"));
    const query = db.select().from(products)
      .orderBy(desc(productTrustScoreOrder(now)), desc(products.createdAt), products.id)
      .limit(1).offset(2).toSQL();
    expect(query.sql.indexOf("order by min(")).toBeLessThan(query.sql.indexOf(" limit "));
    expect(query.sql).toContain('"products"."created_at" desc, "products"."id"');
    expect(query.sql.slice(query.sql.indexOf("order by"))).not.toMatch(/is_featured|orders|payment/);
  });
});
