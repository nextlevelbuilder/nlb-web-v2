import { notFound, validationFailed } from "@/lib/blog/blog-errors";
import { rowToPost } from "@/lib/blog/blog-post-mapper";
import { versionQuerySchema, zodIssues } from "@/lib/blog/blog-post-schema";
import { changePostStatus, updatePost } from "@/lib/blog/blog-post-service";
import { findPostCandidates } from "@/lib/blog/blog-queries";
import { dataResponse, handleBlogRead, handleBlogWrite, isBlogAdmin } from "@/lib/blog/blog-route-helpers";
import { isBlogLocale } from "@/lib/blog/blog-types";

type Params = { params: Promise<{ idOrSlug: string }> };

/** Published posts are public. Drafts and archived posts are visible to admins only (404 otherwise). */
export async function GET(request: Request, { params }: Params) {
  return handleBlogRead(async () => {
    const { idOrSlug } = await params;
    const localeParam = new URL(request.url).searchParams.get("locale");
    if (localeParam !== null && !isBlogLocale(localeParam)) throw validationFailed([{ path: "locale", message: 'Expected "en" or "vi".' }]);
    const candidates = await findPostCandidates(idOrSlug, localeParam ?? undefined);
    // Credentials are only resolved when a non-public candidate exists, keeping public reads cheap.
    const hasHidden = candidates.some((row) => row.status !== "published");
    if (hasHidden && (await isBlogAdmin(request, "mcp:read"))) return dataResponse(rowToPost(candidates[0]));
    const published = candidates.find((row) => row.status === "published");
    if (published) return dataResponse(rowToPost(published));
    throw notFound();
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { idOrSlug } = await params;
  return handleBlogWrite(request, async ({ caller, body }) => ({ data: await updatePost(idOrSlug, body, { id: caller.user.id }) }));
}

/** Archives the post (soft delete); `?version=N` is required for optimistic concurrency. */
export async function DELETE(request: Request, { params }: Params) {
  const { idOrSlug } = await params;
  return handleBlogWrite(request, async ({ caller }) => {
    const parsed = versionQuerySchema.safeParse({ version: new URL(request.url).searchParams.get("version") ?? undefined });
    if (!parsed.success) throw validationFailed(zodIssues(parsed.error));
    return { data: await changePostStatus(idOrSlug, "archive", parsed.data.version, { id: caller.user.id }) };
  });
}
