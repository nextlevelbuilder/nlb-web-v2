import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { createCourseVideoSchema } from "@/lib/courses/course-video-schemas";
import { createVideo, listVideos } from "@/lib/courses/course-video-service";
import { toOperatorVideo } from "@/lib/operators/http/operator-content-queries";
import { operatorDomainResource, readJsonObject, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["draft", "published", "archived"]).nullable();

/** Every Courses video, any status (`?status=` filters). Needs `courses:manage`. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "courses",
    action: "courses.video.list",
    prepare: async () => {
      const status = statusSchema.parse(new URL(request.url).searchParams.get("status"));
      return { resource: operatorDomainResource("courses"), args: { status } };
    },
    run: async ({ db }, { args }) => ok((await listVideos(db, args.status ?? undefined)).map(toOperatorVideo)),
  });
}

/** Create a draft video; the Polar product is created on publish. */
export async function POST(request: Request) {
  return runOperatorRoute({
    request,
    domain: "courses",
    action: "courses.video.create",
    prepare: async () => {
      const input = createCourseVideoSchema.parse((await readJsonObject(request)).body);
      return { resource: operatorDomainResource("courses"), args: { slug: input.slug }, details: { slug: input.slug }, input };
    },
    run: async ({ db }, { input }) => ok(toOperatorVideo(await createVideo(input, db)), undefined, 201),
  });
}
