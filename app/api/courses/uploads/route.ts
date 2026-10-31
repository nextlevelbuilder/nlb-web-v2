import { NextResponse } from "next/server";
import { createCourseUploadSchema } from "@/lib/courses/course-video-schemas";
import { readJsonBody, requireAdmin, toErrorResponse } from "@/lib/courses/course-route-helpers";
import { defaultStreamUploadClient } from "@/lib/courses/course-video-service";

export const dynamic = "force-dynamic";

/**
 * Admin: reserve a signed-only Stream video and return its one-time tus upload URL. The uploader sends
 * the file straight to Stream (`PATCH uploadUrl`), then registers it with `POST /api/courses/videos`.
 * 201 created, 400 invalid body, 401/403 not an admin, 502 Stream refused, 503 Stream not configured.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const input = createCourseUploadSchema.parse(await readJsonBody(request));
    const upload = await defaultStreamUploadClient().createUpload(input);
    return NextResponse.json({ data: upload }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Create course upload");
  }
}
