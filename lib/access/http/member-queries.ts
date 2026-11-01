/**
 * Read models behind the permission-aware member routes. Each function returns only what its route
 * may show; the route has already asked `authorize()` for the resource.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { assets, members, organizations, products } from "@/lib/db/schema";

export type AssetRow = typeof assets.$inferSelect;

/** Asset projection for members: never the storage key or checksum. */
export function toMemberAsset(asset: AssetRow) {
  return {
    id: asset.id,
    orgId: asset.orgId,
    productId: asset.productId ?? null,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    status: asset.status,
    publicUrl: asset.publicUrl ?? null,
    createdAt: asset.createdAt.toISOString(),
    promotedAt: asset.promotedAt ? asset.promotedAt.toISOString() : null,
  };
}

export async function getAsset(db: AppDb, assetId: string): Promise<AssetRow | null> {
  const [row] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  return row ?? null;
}

/** Assets of one organization, newest first. */
export function listOrgAssets(db: AppDb, orgId: string, limit: number): Promise<AssetRow[]> {
  return db.select().from(assets).where(eq(assets.orgId, orgId)).orderBy(desc(assets.createdAt)).limit(limit);
}

/** Organizations the user belongs to, with the member's role. */
export function listMemberships(db: AppDb, userId: string) {
  return db
    .select({ orgId: organizations.id, name: organizations.name, slug: organizations.slug, role: members.role })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(eq(members.userId, userId))
    .orderBy(organizations.name);
}

/** Directory products of the given organizations, any status, newest first. */
export function listOrgProducts(db: AppDb, orgIds: string[], status?: string) {
  if (orgIds.length === 0) return Promise.resolve([]);
  const scope = inArray(products.orgId, orgIds);
  return db
    .select({
      id: products.id,
      orgId: products.orgId,
      slug: products.slug,
      title: products.title,
      tagline: products.tagline,
      websiteUrl: products.websiteUrl,
      logoUrl: products.logoUrl,
      status: products.status,
      isFeatured: products.isFeatured,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(status ? and(scope, eq(products.status, status)) : scope)
    .orderBy(desc(products.updatedAt));
}
