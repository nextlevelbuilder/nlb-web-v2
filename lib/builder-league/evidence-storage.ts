/**
 * Private evidence files in the R2 bucket bound as `BUILDER_EVIDENCE` (no public access). Keys are
 * `evidence/{userId}/{evidenceId}/{uuid}.{ext}`; files are read back only through
 * `GET /api/v1/builder-evidence/{id}/files/{name}`, which checks that the viewer owns the evidence or is
 * an admin. The file type comes from the bytes (magic numbers), never from the client's name or header,
 * and only images and PDFs are accepted.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { BuilderApiError } from "./http";

export const EVIDENCE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_MAX_FILES = 5;

/** Structural subset of `R2Bucket` used here, so tests can pass a Miniflare bucket. */
export interface EvidenceBucket {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null>;
  delete(keys: string | string[]): Promise<void>;
}

export type EvidenceMimeType = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "application/pdf";

const EXTENSIONS: Record<EvidenceMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/** Declared types that may describe a sniffed type (browsers send `image/jpg` or nothing at all). */
const DECLARED_ALIASES: Record<string, EvidenceMimeType> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
  "application/pdf": "application/pdf",
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

/** Detects an allowed type from the first bytes, or null. SVG and HTML are never accepted. */
export function sniffEvidenceType(bytes: Uint8Array): EvidenceMimeType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "image/gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, ascii("%PDF-"))) return "application/pdf";
  return null;
}

export interface ValidatedEvidenceFile {
  bytes: Uint8Array;
  contentType: EvidenceMimeType;
  extension: string;
}

/** Validates size, count and content of uploaded files before anything is written. */
export async function validateEvidenceFiles(files: File[], existingCount = 0): Promise<ValidatedEvidenceFile[]> {
  if (files.length + existingCount > EVIDENCE_MAX_FILES) {
    throw new BuilderApiError(400, "too_many_files", `At most ${EVIDENCE_MAX_FILES} files per evidence.`);
  }
  const validated: ValidatedEvidenceFile[] = [];
  for (const file of files) {
    if (file.size === 0) throw new BuilderApiError(400, "empty_file", "Empty files are not accepted.");
    if (file.size > EVIDENCE_MAX_FILE_BYTES) {
      throw new BuilderApiError(413, "file_too_large", "Each file must be 10 MB or smaller.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffEvidenceType(bytes);
    if (!contentType) {
      throw new BuilderApiError(415, "unsupported_file_type", "Only PNG, JPEG, WebP, GIF images and PDF files are accepted.");
    }
    const declared = file.type ? DECLARED_ALIASES[file.type.toLowerCase()] : undefined;
    if (file.type && file.type !== "application/octet-stream" && declared !== contentType) {
      throw new BuilderApiError(415, "file_type_mismatch", "The file content does not match its declared type.");
    }
    validated.push({ bytes, contentType, extension: EXTENSIONS[contentType] });
  }
  return validated;
}

const FILE_NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif|pdf)$/;

export function evidenceObjectKey(userId: string, evidenceId: string, fileName: string): string {
  return `evidence/${userId}/${evidenceId}/${fileName}`;
}

/** The last path segment of a key: what clients see and pass back in the file route. */
export function evidenceFileName(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

export function isEvidenceFileName(name: string): boolean {
  return FILE_NAME_RE.test(name);
}

/** The bucket bound in the Worker; a 503 when the binding is missing (misconfiguration). */
export function getEvidenceBucket(): EvidenceBucket {
  let bucket: unknown;
  try {
    bucket = (getCloudflareContext().env as unknown as Record<string, unknown>).BUILDER_EVIDENCE;
  } catch {
    bucket = undefined;
  }
  if (!bucket || typeof (bucket as EvidenceBucket).put !== "function") {
    throw new BuilderApiError(503, "storage_unavailable", "Evidence storage is not configured.");
  }
  return bucket as EvidenceBucket;
}

/** Stores validated files and returns their keys; on failure, removes what was already written. */
export async function putEvidenceFiles(
  bucket: EvidenceBucket,
  userId: string,
  evidenceId: string,
  files: ValidatedEvidenceFile[]
): Promise<string[]> {
  const keys: string[] = [];
  try {
    for (const file of files) {
      const key = evidenceObjectKey(userId, evidenceId, `${crypto.randomUUID()}.${file.extension}`);
      await bucket.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
      keys.push(key);
    }
  } catch (err) {
    await deleteEvidenceFiles(bucket, keys);
    throw err;
  }
  return keys;
}

/** Best-effort removal (orphans are harmless: they are private and unreferenced). */
export async function deleteEvidenceFiles(bucket: EvidenceBucket, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await bucket.delete(keys);
  } catch (err) {
    console.error("builder evidence: failed to delete orphaned files", err instanceof Error ? err.message : err);
  }
}

/** Streams a stored file with headers that keep it out of every shared cache and inert in the browser. */
export async function evidenceFileResponse(bucket: EvidenceBucket, key: string): Promise<Response | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(object.size),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": `${contentType === "application/pdf" ? "attachment" : "inline"}; filename="${evidenceFileName(key)}"`,
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "referrer-policy": "no-referrer",
    },
  });
}
