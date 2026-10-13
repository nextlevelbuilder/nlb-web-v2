import { notFound } from "@/lib/blog/blog-errors";
import { findPostRowById, listRevisions } from "@/lib/blog/blog-queries";
import { dataResponse, handleBlogRead, requireBlogAdmin } from "@/lib/blog/blog-route-helpers";

type Params = { params: Promise<{ idOrSlug: string }> };

/** Revision history, newest first, without snapshots. */
export async function GET(request: Request, { params }: Params) {
  return handleBlogRead(async () => {
    await requireBlogAdmin(request, "mcp:read");
    const { idOrSlug } = await params;
    if (!(await findPostRowById(idOrSlug))) throw notFound();
    return dataResponse(await listRevisions(idOrSlug));
  });
}
