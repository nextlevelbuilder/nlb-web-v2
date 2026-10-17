import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { resolveCaller } from "@/lib/auth-api-key";
import { MCP_ASSERTION_HEADER } from "@/lib/auth-mcp-delegation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { publicMediaUrl } from "@/lib/media/public-media-url";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

// Allowed MIME types for Images and Videos
const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  // Videos
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export async function POST(request: Request) {
  try {
    if (request.headers.has(MCP_ASSERTION_HEADER)) {
      const caller = await resolveCaller(request.headers, undefined, {
        scope: "mcp:write", method: request.method, path: new URL(request.url).pathname,
      });
      if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    } else {
      try {
        await getAuth().api.getSession({ headers: request.headers });
      } catch {
        // Non-fatal, allow uploads for draft creators.
      }
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const requestedFolder = formData.get("folder");
    // Folder becomes part of the R2 key and the public /media URL: keep it to safe path segments.
    const folder = typeof requestedFolder === "string" && /^[a-z0-9-]{1,40}(?:\/[a-z0-9-]{1,40}){0,2}$/.test(requestedFolder) ? requestedFolder : "uploads";

    if (!file) {
      return NextResponse.json({ error: "No file provided in form data." }, { status: 400 });
    }
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}. Allowed: PNG, JPEG, WebP, SVG, GIF, MP4, WebM, QuickTime.` },
        { status: 400 }
      );
    }

    const isVideo = mimeType.startsWith("video/");
    const maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;

    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size exceeds max limit of ${maxSize / 1024 / 1024}MB.` },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name ? file.name.split(".").pop()?.toLowerCase() || "bin" : "bin";
    const fileHash = crypto.randomUUID();
    const storageKey = `public/${folder}/${fileHash}.${fileExt}`;

    let publicUrl = "";

    // 1. Check if running on Cloudflare Workers with R2 bindings
    try {
      const cf = getCloudflareContext();
      const cfEnv = cf?.env as any;
      const r2Bucket = cfEnv?.MEDIA_PUBLIC || cfEnv?.MEDIA_STAGING;

      if (r2Bucket && typeof r2Bucket.put === "function") {
        await r2Bucket.put(storageKey, fileBuffer, {
          httpMetadata: {
            contentType: mimeType,
          },
        });

        // Served by app/media/[...key] on the origin that received the upload; the bucket has no public domain of its own.
        publicUrl = publicMediaUrl(storageKey, new URL(request.url).origin);

        return NextResponse.json({
          success: true,
          url: publicUrl,
          storageKey,
          sizeBytes: file.size,
          mimeType,
          provider: "cloudflare-r2",
        });
      }
    } catch {
      // Fall through to local development storage
    }

    // 2. Local development fallback (writes to public/uploads)
    try {
      const uploadDir = path.join(process.cwd(), "public", "uploads");
      await fs.mkdir(uploadDir, { recursive: true });
      const localFilePath = path.join(uploadDir, `${fileHash}.${fileExt}`);
      await fs.writeFile(localFilePath, fileBuffer);

      publicUrl = `/uploads/${fileHash}.${fileExt}`;
      return NextResponse.json({
        success: true,
        url: publicUrl,
        storageKey,
        sizeBytes: file.size,
        mimeType,
        provider: "local-dev",
      });
    } catch (localErr: any) {
      // If filesystem write fails (e.g. read-only environment), return data URI for images
      if (!isVideo && file.size < 2 * 1024 * 1024) {
        const base64Url = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
        return NextResponse.json({
          success: true,
          url: base64Url,
          storageKey,
          sizeBytes: file.size,
          mimeType,
          provider: "inline-data",
        });
      }
      throw new Error(`Upload storage error: ${localErr.message}`);
    }
  } catch (err: any) {
    console.error("Media upload error:", err);
    return NextResponse.json({ error: err.message || "Failed to upload file." }, { status: 500 });
  }
}
