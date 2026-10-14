import { getDb, type AppDb } from "@/lib/db";
import { publicMediaUrl } from "@/lib/media/public-media-url";
import { assets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
];

export const MAX_ASSET_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface GenerateUploadUrlParams {
  orgId: string;
  productId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Generate a namespaced storage key and prepare an asset record in staging status.
 */
export async function registerStagingAsset(params: GenerateUploadUrlParams, customDb?: AppDb) {
  if (!ALLOWED_MIME_TYPES.includes(params.mimeType)) {
    throw new Error(`Unsupported MIME type: ${params.mimeType}`);
  }

  if (params.sizeBytes > MAX_ASSET_SIZE_BYTES) {
    throw new Error(`Asset exceeds max size of ${MAX_ASSET_SIZE_BYTES / 1024 / 1024}MB.`);
  }

  const ext = params.filename.split(".").pop() || "bin";
  const fileId = crypto.randomUUID();
  const storageKey = `staging/${params.orgId}/${params.productId || "common"}/${fileId}.${ext}`;

  const db = customDb || getDb();
  const [asset] = await db
    .insert(assets)
    .values({
      orgId: params.orgId,
      productId: params.productId || null,
      storageKey,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      checksumSha256: "pending_upload",
      status: "staging",
    })
    .returning();

  return { asset, storageKey };
}

/**
 * Complete asset upload after HeadObject/checksum verification.
 */
export async function completeAssetUpload(
  {
    assetId,
    checksumSha256,
    actualSizeBytes,
  }: {
    assetId: string;
    checksumSha256: string;
    actualSizeBytes: number;
  },
  customDb?: AppDb
) {
  const db = customDb || getDb();
  const [asset] = await db
    .update(assets)
    .set({
      checksumSha256,
      sizeBytes: actualSizeBytes,
    })
    .where(eq(assets.id, assetId))
    .returning();

  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  return asset;
}

/**
 * Promote an approved asset from private staging to public CDN.
 * Executed during listing revision approval.
 */
export async function promoteAssetToPublic(assetId: string, customDb?: AppDb) {
  const db = customDb || getDb();
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  // Public URL is derived from content-addressed storage key
  // Served by the app's /media route: NEXT_PUBLIC_ASSETS_URL (cdn.nextlevelbuilder.io) has no bucket behind it.
  const publicUrl = publicMediaUrl(asset.storageKey.replace("staging/", "public/"));

  const [promoted] = await db
    .update(assets)
    .set({
      status: "approved",
      publicUrl,
      promotedAt: new Date(),
    })
    .where(eq(assets.id, assetId))
    .returning();

  return promoted;
}
