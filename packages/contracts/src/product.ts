import crypto from "crypto";
import type { ProductDocument } from "./product-document";
export { ProductDocumentSchema, type ProductDocument } from "./product-document";

/**
 * Deterministically sort object keys for canonical JSON hashing.
 */
function canonicalize(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalize);
  }
  const obj = val as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalize(obj[key]);
  }
  return sorted;
}

/**
 * Compute the canonical SHA-256 content hash of a product document.
 * Guarantees identical hashes across web, REST, CLI, and MCP regardless of key insertion order.
 */
export function computeContentHash(document: ProductDocument): string {
  const canonicalObj = canonicalize(document);
  const canonicalJson = JSON.stringify(canonicalObj);
  return crypto.createHash("sha256").update(canonicalJson).digest("hex");
}
