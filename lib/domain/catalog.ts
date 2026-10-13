import { getDb, type AppDb } from "@/lib/db";
import { products, productRevisions, categories, tags, productCategories, productTags, orders } from "@/lib/db/schema";
import { eq, and, asc, desc, sql, inArray } from "drizzle-orm";
import { PRODUCT_IDS } from "@/lib/polar";
import { ProductDocumentSchema, computeContentHash, type ProductDocument } from "@/packages/contracts/src";
import crypto from "crypto";
import { projectProductTrust } from "./trust";
import { productTrustScoreOrder } from "./product-trust-order";
import { publishedDocument } from "./published-document";

export interface CreateProductDraftParams {
  orgId: string;
  slug: string;
  title: string;
  tagline: string;
  websiteUrl: string;
  logoUrl?: string;
}

export interface CreateRevisionParams {
  productId: string;
  createdBy: string;
  document: ProductDocument;
}

/**
 * Create a new product draft under an organization.
 */
export async function createProductDraft(params: CreateProductDraftParams, customDb?: AppDb) {
  const db = customDb || getDb();

  // Validate unique slug
  const [existing] = await db.select().from(products).where(eq(products.slug, params.slug)).limit(1);
  if (existing) {
    throw new Error(`Product with slug '${params.slug}' already exists.`);
  }

  const [product] = await db
    .insert(products)
    .values({
      orgId: params.orgId,
      slug: params.slug,
      title: params.title,
      tagline: params.tagline,
      websiteUrl: params.websiteUrl,
      logoUrl: params.logoUrl,
      status: "draft",
    })
    .returning();

  return product;
}

/**
 * Count paid publishing-toolkit orders to decide Early Bird eligibility (<100 paid orders).
 * A single aggregate read is already atomic on D1, so no transaction wrapper is needed.
 */
export async function claimEarlyBirdSlot(productId: string, customDb?: AppDb): Promise<{ isEarlyBird: boolean; slotNumber: number }> {
  void productId;
  const db = customDb || getDb();

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(
      and(
        inArray(orders.polarProductId, [
          PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD,
          PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD,
        ]),
        eq(orders.status, "paid")
      )
    );

  const count = Number(countRow?.count || 0);
  return { isEarlyBird: count < 100, slotNumber: count + 1 };
}

/**
 * Create an immutable product revision from a validated document.
 */
export async function createProductRevision(params: CreateRevisionParams, customDb?: AppDb) {
  const db = customDb || getDb();
  const validatedDoc = ProductDocumentSchema.parse(params.document);
  const hash = computeContentHash(validatedDoc);

  // Compute next revision number
  const [latestRevision] = await db
    .select({ revisionNumber: productRevisions.revisionNumber })
    .from(productRevisions)
    .where(eq(productRevisions.productId, params.productId))
    .orderBy(desc(productRevisions.revisionNumber))
    .limit(1);

  const nextRevisionNumber = (latestRevision?.revisionNumber || 0) + 1;

  // Insert the immutable revision and advance the product pointer in one D1 batch (atomic).
  const revisionId = crypto.randomUUID();
  const [[revision]] = await db.batch([
    db
      .insert(productRevisions)
      .values({
        id: revisionId,
        productId: params.productId,
        createdBy: params.createdBy,
        revisionNumber: nextRevisionNumber,
        schemaVersion: 1,
        status: "draft",
        contentHash: hash,
        title: validatedDoc.title,
        tagline: validatedDoc.tagline,
        description: validatedDoc.description,
        document: validatedDoc,
        categoriesSnapshot: validatedDoc.categorySlugs,
        tagsSnapshot: validatedDoc.tagSlugs,
      })
      .returning(),
    db
      .update(products)
      .set({
        currentRevisionId: revisionId,
        title: validatedDoc.title,
        tagline: validatedDoc.tagline,
        websiteUrl: validatedDoc.websiteUrl,
        logoUrl: validatedDoc.logoUrl,
        updatedAt: new Date(),
      })
      .where(eq(products.id, params.productId)),
  ]);

  return revision;
}

/**
 * Retrieve a published product projection by slug.
 */
export async function getPublishedProductBySlug(slug: string, customDb?: AppDb) {
  const db = customDb || getDb();

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "published")))
    .limit(1);

  if (!product) {
    return null;
  }

  // currentRevisionId is also advanced when saving drafts. Public readers must
  // select a public revision independently of that mutable pointer. Seeded
  // revisions use published; moderation decisions use approved.
  const [revision] = await db
    .select()
    .from(productRevisions)
    .where(and(eq(productRevisions.productId, product.id), inArray(productRevisions.status, ["approved", "published"])))
    .orderBy(desc(productRevisions.revisionNumber), desc(productRevisions.createdAt))
    .limit(1);

  if (!revision) {
    return null;
  }

  return { product: publishedProductProjection(product, revision), revision };
}

/** Draft saves also change the products row, so public metadata comes from the approved document. */
export function publishedProductProjection(
  product: typeof products.$inferSelect,
  revision: typeof productRevisions.$inferSelect,
  now = Date.now(),
) {
  const document = publishedDocument(revision);
  return projectProductTrust({
    ...product,
    title: revision.title,
    tagline: revision.tagline,
    websiteUrl: document.websiteUrl,
    logoUrl: document.logoUrl ?? null,
    currentRevisionId: revision.id,
    updatedAt: revision.createdAt,
  }, now);
}

/**
 * Retrieve a list of published products with optional filtering.
 */
async function queryPublishedProducts(
  { limit = 20, offset = 0, orgIds, productIds }: { limit?: number; offset?: number; orgIds?: string[]; productIds?: string[] },
  customDb?: AppDb,
  now = Date.now(),
) {
  const db = customDb || getDb();

  // Legacy rows may hold a JSON-encoded string of the document; unwrap it once before reading fields.
  const document = sql`(case when json_type(${productRevisions.document}) = 'text'
    then json_extract(${productRevisions.document}, '$') else ${productRevisions.document} end)`;
  const websiteUrl = sql`coalesce(json_extract(${document}, '$.websiteUrl'), json_extract(${document}, '$.metadata.websiteUrl'))`;

  return await db
    .select({ product: products, revision: productRevisions })
    .from(products)
    .innerJoin(productRevisions, eq(productRevisions.id, sql`(
      select approved.id from product_revisions approved
      where approved.product_id = ${products.id} and approved.status in ('approved', 'published')
      order by approved.revision_number desc, approved.created_at desc limit 1
    )`))
    .where(and(
      eq(products.status, "published"),
      orgIds ? inArray(products.orgId, orgIds) : undefined,
      productIds ? inArray(products.id, productIds) : undefined,
    ))
    .limit(limit)
    .offset(offset)
    // Sort by the published document's evidence, never an unpublished draft URL.
    .orderBy(desc(productTrustScoreOrder(now, websiteUrl)), desc(products.createdAt), asc(products.id));
}

export async function getPublishedProducts(options: { limit?: number; offset?: number; orgIds?: string[] }, customDb?: AppDb) {
  const now = Date.now();
  const rows = await queryPublishedProducts(options, customDb, now);
  return rows.map(({ product, revision }) => publishedProductProjection(product, revision, now));
}

/** Preserve editable dashboard metadata while scoring published products from their public revisions. */
export async function projectDashboardProductTrust(rows: Array<typeof products.$inferSelect>, customDb?: AppDb) {
  const now = Date.now();
  const publishedIds = rows.filter((product) => product.status === "published").map((product) => product.id);
  const publishedRows = publishedIds.length
    ? await queryPublishedProducts({ limit: publishedIds.length, productIds: publishedIds }, customDb, now)
    : [];
  const scores = new Map(publishedRows.map(({ product, revision }) => [
    product.id, publishedProductProjection(product, revision, now).trustScore,
  ]));
  return rows.map((product) => ({
    ...product,
    trustScore: scores.get(product.id) ?? projectProductTrust(product, now).trustScore,
  }));
}

/** Traverse every page for discovery documents; do not silently truncate at 100 products. */
export async function getAllPublishedProducts(customDb?: AppDb) {
  const db = customDb || getDb();
  const all: Array<ReturnType<typeof publishedProductProjection> & { publishedDocument: ProductDocument }> = [];
  const batchSize = 100;
  const now = Date.now();
  for (let offset = 0; ; offset += batchSize) {
    const batch = await queryPublishedProducts({ limit: batchSize, offset }, db, now);
    all.push(...batch.map(({ product, revision }) => ({
      ...publishedProductProjection(product, revision, now),
      publishedDocument: publishedDocument(revision),
    })));
    if (batch.length < batchSize) return all;
  }
}
