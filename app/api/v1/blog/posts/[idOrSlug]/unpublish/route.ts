import { validationFailed } from "@/lib/blog/blog-errors";
import { versionBodySchema, zodIssues } from "@/lib/blog/blog-post-schema";
import { changePostStatus } from "@/lib/blog/blog-post-service";
import { handleBlogWrite } from "@/lib/blog/blog-route-helpers";

type Params = { params: Promise<{ idOrSlug: string }> };

export async function POST(request: Request, { params }: Params) {
  const { idOrSlug } = await params;
  return handleBlogWrite(request, async ({ caller, body }) => {
    const parsed = versionBodySchema.safeParse(body);
    if (!parsed.success) throw validationFailed(zodIssues(parsed.error));
    return { data: await changePostStatus(idOrSlug, "unpublish", parsed.data.version, { id: caller.user.id }) };
  });
}
