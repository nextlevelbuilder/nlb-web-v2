import { notFound } from "@/lib/blog/blog-errors";
import { getRevision } from "@/lib/blog/blog-queries";
import { dataResponse, handleBlogRead, requireBlogAdmin } from "@/lib/blog/blog-route-helpers";

type Params = { params: Promise<{ idOrSlug: string; revisionId: string }> };

/** One revision including its full post snapshot. */
export async function GET(request: Request, { params }: Params) {
  return handleBlogRead(async () => {
    await requireBlogAdmin(request, "mcp:read");
    const { idOrSlug, revisionId } = await params;
    const revision = await getRevision(idOrSlug, revisionId);
    if (!revision) throw notFound("Revision not found");
    return dataResponse(revision);
  });
}
