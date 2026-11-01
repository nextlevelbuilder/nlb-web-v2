import { ok } from "@/lib/builder-league/http";
import { retryJob } from "@/lib/onboarding/jobs";
import { requirePathParam, runOperatorRoute } from "@/lib/operators/http/operator-route";
import { operatorConflict } from "@/lib/operators/operator-service-error";

export const dynamic = "force-dynamic";

/** Put a dead or finished job back in the queue with fresh attempts; `not_retryable` (409) while it runs. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runOperatorRoute({
    request,
    domain: "system",
    action: "system.job.retry",
    prepare: async () => {
      const jobId = requirePathParam((await params).id, "id");
      return { resource: `job:${jobId}`, args: { jobId }, jobId };
    },
    run: async ({ db, now }, { jobId }) => {
      if (!(await retryJob(db, jobId, now))) throw operatorConflict("not_retryable", "The job is missing or running");
      return ok({ id: jobId, retried: true });
    },
  });
}
