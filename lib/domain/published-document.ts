import type { productRevisions } from "@/lib/db/schema";
import type { ProductDocument } from "@/packages/contracts/src";

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
