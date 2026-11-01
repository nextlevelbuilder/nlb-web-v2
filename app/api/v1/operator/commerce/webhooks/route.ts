import { z } from "zod";
import { ok, parseLimit } from "@/lib/builder-league/http";
import { listWebhookEvents } from "@/lib/operators/http/operator-account-queries";
import { operatorDomainResource, runOperatorRoute } from "@/lib/operators/http/operator-route";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["failed", "pending"]);

/** Polar webhook deliveries that failed or are still unprocessed (`?status=failed` default). No payloads. */
export async function GET(request: Request) {
  return runOperatorRoute({
    request,
    domain: "commerce",
    action: "commerce.webhook.list",
    prepare: async () => {
      const query = new URL(request.url).searchParams;
      const filter = { status: statusSchema.parse(query.get("status") ?? "failed"), limit: parseLimit(query.get("limit"), 50, 100) };
      return { resource: operatorDomainResource("commerce"), args: filter, filter };
    },
    run: async ({ db }, { filter }) => ok(await listWebhookEvents(db, filter)),
  });
}
