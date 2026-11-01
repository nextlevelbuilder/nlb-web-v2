import { ok } from "@/lib/builder-league/http";
import { listJobHealth } from "@/lib/operators/http/operator-system-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

/** Background job health: counts per status and kind, dead jobs and pending jobs that already failed. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "system",
    action: "system.job.list",
    prepare: async () => ({ resource: operatorDomainResource("system"), args: {} }),
    run: async ({ db, now }) => ok(await listJobHealth(db, now)),
  });
}
