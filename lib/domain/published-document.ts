import type { productRevisions } from "@/lib/db/schema";
import type { ProductDocument } from "@nextlevelbuilder/contracts";

function readSnapshot(value: unknown): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (parsed == null) return [];
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== "string")) throw new Error("Invalid published taxonomy snapshot");
  return parsed;
}

/** Read legacy seeded metadata without changing the immutable document or its hash. */
export function publishedDocument(revision: typeof productRevisions.$inferSelect): ProductDocument {
  const document = typeof revision.document === "string" ? JSON.parse(revision.document) : revision.document;
  if (!document.metadata || typeof document.metadata !== "object") return document;
  return {
    ...document.metadata,
    ...document,
    title: document.title ?? revision.title,
    tagline: document.tagline ?? revision.tagline,
    description: document.description ?? revision.description,
    categorySlugs: document.categorySlugs ?? readSnapshot(revision.categoriesSnapshot),
    tagSlugs: document.tagSlugs ?? readSnapshot(revision.tagsSnapshot),
  };
}

/**
 * Cover image for catalogue cards: the first image of the first mediaGallery block, else null.
 * Reads the stored document defensively (legacy rows are not schema-validated) and only returns
 * absolute http(s) URLs, the same constraint HttpUrlSchema places on gallery images.
 */
export function publishedCoverUrl(document: Pick<ProductDocument, "blocks"> | null | undefined): string | null {
  const blocks: unknown = document?.blocks;
  if (!Array.isArray(blocks)) return null;
  const gallery = blocks.find((block): block is { type: "mediaGallery"; props?: { images?: unknown } } =>
    typeof block === "object" && block !== null && (block as { type?: unknown }).type === "mediaGallery");
  const images = gallery?.props?.images;
  const url: unknown = Array.isArray(images) ? (images[0] as { url?: unknown } | undefined)?.url : undefined;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}
