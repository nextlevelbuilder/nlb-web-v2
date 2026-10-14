import { getCloudflareContext } from "@opennextjs/cloudflare";
import { mediaKeyFromSegments } from "@/lib/media/public-media-url";

/** Minimal surface of the R2 binding used here. */
interface R2ObjectBodyLike {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  httpMetadata?: { contentType?: string };
}
interface R2BucketLike {
  get(key: string, options?: { onlyIf?: Headers }): Promise<R2ObjectBodyLike | { httpEtag: string } | null>;
}

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

/**
 * Streams public media (product logos, screenshots, uploads) from the MEDIA_PUBLIC R2 bucket.
 * Objects are written once under unique or versioned keys, so responses are cached as immutable.
 * SVGs are served with a sandboxing CSP so an uploaded SVG cannot run script on this origin.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const resolved = mediaKeyFromSegments((await params).key);
  if (!resolved) return NOT_FOUND();

  let bucket: R2BucketLike | undefined;
  try {
    bucket = (getCloudflareContext().env as unknown as { MEDIA_PUBLIC?: R2BucketLike }).MEDIA_PUBLIC;
  } catch (error) {
    console.error("media: Cloudflare context unavailable", error instanceof Error ? error.message : error);
  }
  if (!bucket) return new Response("Media storage unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });

  try {
    const object = await bucket.get(resolved.key, { onlyIf: request.headers });
    if (!object) return NOT_FOUND();
    const headers = new Headers({
      "Content-Type": resolved.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: object.httpEtag,
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    });
    if (resolved.contentType === "image/svg+xml") headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    // A conditional request that matched returns metadata without a body.
    if (!("body" in object)) return new Response(null, { status: 304, headers });
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { headers });
  } catch (error) {
    console.error("media: R2 read failed", resolved.key, error instanceof Error ? error.message : error);
    return new Response("Media temporarily unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
