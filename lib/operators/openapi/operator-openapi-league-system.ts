/** OpenAPI paths of the Builder League, community and system operator domains (`/api/v1/operator`). */
import { CLAIM_ACTIONS, REWARD_CLAIM_STATUSES } from "@/lib/builder-league/rewards";
import { COMMUNITY_TARGETS } from "@/lib/community/types";
import { object, op, pagedEnvelope, str } from "./operator-openapi-shared";

const pathId = (name: string) => ({ name, in: "path", required: true, schema: str });
const query = (name: string, schema: unknown = str) => ({ name, in: "query", schema });
const approvalId = { type: "string", description: "Approved, unconsumed approval requested by this operator for exactly these arguments" };
const anyArray = { type: "array", items: { type: "object", additionalProperties: true } };

export const leagueSystemPaths: Record<string, unknown> = {
  "/api/v1/operator/builder-league/queue": {
    get: op(
        "List the moderation queue",
        "Evidence awaiting review, oldest first, with a keyset `cursor`. `?view=appeals` lists open appeals instead. Needs `builder_league:manage`.",
        {
          params: [
            query("view", { type: "string", enum: ["appeals"] }),
            query("status"),
            query("stage"),
            query("eventType"),
            query("olderThanHours", { type: "integer", minimum: 1 }),
            query("cursor"),
            query("limit", { type: "integer", minimum: 1, maximum: 100 }),
          ],
          extra: { "200": { description: "OK", content: pagedEnvelope(anyArray) } },
        }
      ),
  },
  "/api/v1/operator/builder-league/evidence/{id}/decision": {
    post: op(
      "Decide evidence",
      "Approve, reject or ask for more information. Session only; never on one's own evidence. Approving is idempotent and returns the award.",
      {
        params: [pathId("id")],
        body: object(
          { decision: { type: "string", enum: ["approve", "reject", "needs_info"] }, reasonCodes: { type: "array", items: str }, note: { type: ["string", "null"] } },
          ["decision"]
        ),
      }
    ),
  },
  "/api/v1/operator/builder-league/ledger/{entryId}/reverse": {
    post: op(
      "Reverse a ledger entry",
      "Sensitive (`builder_league.ledger.reverse`, target `{ entryId, reason }`). Writes a negative entry; idempotent per entry.",
      {
        params: [pathId("entryId")],
        body: object({ reason: { type: "string", minLength: 5, maxLength: 1000 }, approvalId }, ["reason", "approvalId"]),
      }
    ),
  },
  "/api/v1/operator/builder-league/rewards/claims": {
    get: op("List reward claims", "Newest first; `?status=` filters.", {
      params: [query("status", { type: "string", enum: [...REWARD_CLAIM_STATUSES] }), query("limit", { type: "integer", minimum: 1, maximum: 500 })],
      data: anyArray,
    }),
  },
  "/api/v1/operator/builder-league/rewards/claims/{id}/decision": {
    post: op("Decide a reward claim", "A freed place returns to inventory.", {
      params: [pathId("id")],
      body: object(
        { action: { type: "string", enum: [...CLAIM_ACTIONS] }, note: { type: ["string", "null"], maxLength: 500 }, redeemWithinDays: { type: "integer", minimum: 1, maximum: 365 } },
        ["action"]
      ),
    }),
  },
  "/api/v1/operator/builder-league/rewards/items": {
    get: op("List reward items", "Every catalogue item, active or not.", { data: anyArray }),
    post: op("Create or update a reward item", "Upsert by `key`; also recorded in the Builder League audit.", {
      body: { type: "object", additionalProperties: true, required: ["key"], properties: { key: str } },
    }),
  },
  "/api/v1/operator/builder-league/privacy/{userId}/export": {
    get: op("Export a member's Builder League data", "Everything the Builder League stores about one member.", { params: [pathId("userId")] }),
  },
  "/api/v1/operator/builder-league/privacy/{userId}/delete": {
    post: op(
      "Delete a member's Builder League data",
      "Sensitive and irreversible (`builder_league.privacy.delete`, target `{ userId }`): deletes the data and pseudonymises the history. `self_delete` (409).",
      { params: [pathId("userId")], body: object({ approvalId }, ["approvalId"]) }
    ),
  },
  "/api/v1/operator/community/reconcile": {
    post: op("Queue a community access reconcile", "Applies the user's current membership to each target. Answers 202. Needs `community:manage`.", {
      body: object({ userId: str, targets: { type: "array", minItems: 1, items: { type: "string", enum: [...COMMUNITY_TARGETS] } } }, ["userId"]),
      status: "202",
      data: object({ userId: str, targets: { type: "array", items: str }, queued: { type: "boolean" } }),
    }),
  },
  "/api/v1/operator/system/jobs": {
    get: op("Background job health", "Counts per status and kind, dead jobs and pending jobs that already failed; payloads are never returned. Needs `system:manage`.", {
      data: object({ stats: { type: "object", additionalProperties: true }, dead: anyArray, failed: anyArray }),
    }),
  },
  "/api/v1/operator/system/jobs/{id}/retry": {
    post: op("Retry a job", "Back in the queue with fresh attempts. `not_retryable` (409) when missing or running.", {
      params: [pathId("id")],
      data: object({ id: str, retried: { type: "boolean" } }),
    }),
  },
};
