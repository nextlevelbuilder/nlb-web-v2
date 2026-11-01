import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { archiveVideo } from "@/lib/courses/course-video-service";
import { toOperatorVideo } from "@/lib/operators/http/operator-content-queries";
import { readJsonObject, requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { videoArchiveTarget } from "@/lib/operators/http/operator-sensitive-targets";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ approvalId: z.string().trim().min(1).max(200) }).strict();

/**
 * Archive a video (sensitive `courses.video.archive`): it leaves the catalogue for new buyers while
 * existing buyers keep watching. Needs an approval for `{ slug }` decided by a different operator.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return runOperatorRoute({
    request,
    domain: "courses",
    action: "courses.video.archive",
    prepare: async ({ db }) => {
      const slug = requirePathParam((await params).slug, "slug");
      const { approvalId } = bodySchema.parse((await readJsonObject(request)).body);
      return { ...(await videoArchiveTarget(db, slug)), approvalId, slug };
    },
    run: async ({ db }, { slug }) => ok(toOperatorVideo(await archiveVideo(slug, db))),
  });
}
