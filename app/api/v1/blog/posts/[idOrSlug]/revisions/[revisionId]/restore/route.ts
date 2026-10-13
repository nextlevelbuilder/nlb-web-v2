import { validationFailed } from "@/lib/blog/blog-errors";
import { versionBodySchema, zodIssues } from "@/lib/blog/blog-post-schema";
import { restorePostRevision } from "@/lib/blog/blog-post-service";
import { handleBlogWrite } from "@/lib/blog/blog-route-helpers";

type Params = { params: Promise<{ idOrSlug: string; revisionId: string }> };

/** Restores the revision's content as a new version; status is unchanged. */
export async function POST(request: Request, { params }: Params) {
  const { idOrSlug, revisionId } = await params;
  return handleBlogWrite(request, async ({ caller, body }) => {
    const parsed = versionBodySchema.safeParse(body);
    if (!parsed.success) throw validationFailed(zodIssues(parsed.error));
    return { data: await restorePostRevision(idOrSlug, revisionId, parsed.data.version, { id: caller.user.id }) };
  });
}
