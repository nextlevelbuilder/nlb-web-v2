import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { listModerationCases } from "@/lib/operators/http/operator-content-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["open", "in_review", "decided"]).default("in_review");

/** The moderation queue (`?status=`, in_review by default), highest priority first. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "directory",
    action: "directory.moderation.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const args = { status: statusSchema.parse(query.get("status") ?? undefined), limit: parseLimit(query.get("limit"), 50, 100) };
      return { resource: operatorDomainResource("directory"), args };
    },
    run: async ({ db }, { args }) => ok(await listModerationCases(db, args)),
  });
}
