import { validationFailed } from "@/lib/blog/blog-errors";
import { listPostsQuerySchema, zodIssues } from "@/lib/blog/blog-post-schema";
import { createPost } from "@/lib/blog/blog-post-service";
import { listPostSummaries } from "@/lib/blog/blog-queries";
import { handleBlogRead, handleBlogWrite, requireBlogAdmin } from "@/lib/blog/blog-route-helpers";
import { NextResponse } from "next/server";

/** Published posts are public; status=draft|archived|all requires an admin caller (mcp:read). */
export async function GET(request: Request) {
  return handleBlogRead(async () => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = listPostsQuerySchema.safeParse(params);
    if (!parsed.success) throw validationFailed(zodIssues(parsed.error));
    const query = parsed.data;
    if (query.status !== "published") await requireBlogAdmin(request, "mcp:read");
    const data = await listPostSummaries(query);
    return NextResponse.json(
      { data, pagination: { limit: query.limit, offset: query.offset, count: data.length } },
      { headers: { "cache-control": query.status === "published" ? "public, max-age=60" : "no-store" } }
    );
  });
}

export async function POST(request: Request) {
  return handleBlogWrite(request, async ({ caller, body }) => ({
    data: await createPost(body, { id: caller.user.id }),
    status: 201,
  }));
}
