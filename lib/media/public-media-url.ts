/**
 * Public media served from the MEDIA_PUBLIC R2 bucket through the app's own /media route
 * (app/media/[...key]/route.ts). The bucket has no public r2.dev URL or custom domain, so the
 * site origin is the only public address for these objects.
 */
import { siteUrl } from "@/lib/seo";

/** R2 keys for public media all live under this prefix. */
export const PUBLIC_MEDIA_PREFIX = "public/";

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** Path segments after /media/: lowercase-safe names, one extension from the allowlist, no traversal. */
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

/** Maps `/media/<segments>` to its R2 key, or null when the path is not a servable media file. */
export function mediaKeyFromSegments(segments: string[]): { key: string; contentType: string } | null {
  if (segments.length < 2 || segments.length > 6) return null;
  if (!segments.every((segment) => SEGMENT_RE.test(segment) && !segment.includes(".."))) return null;
  const extension = segments[segments.length - 1].split(".").pop()?.toLowerCase() ?? "";
  const contentType = EXTENSION_TYPES[extension];
  return contentType ? { key: `${PUBLIC_MEDIA_PREFIX}${segments.join("/")}`, contentType } : null;
}

/**
 * Absolute public URL for an R2 key under `public/`. Pass the origin that actually serves this
 * deployment (the request origin, or the seed script's --media-origin) when it can differ from the
 * configured site URL, e.g. before a custom domain points at the worker.
 */
export function publicMediaUrl(storageKey: string, origin: string = siteUrl()): string {
  return `${origin.replace(/\/+$/, "")}/media/${storageKey.replace(/^public\//, "")}`;
}
