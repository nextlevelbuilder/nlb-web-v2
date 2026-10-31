import { ok } from "@/lib/builder-league/http";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { getActiveRules, publishProgramRules } from "@/lib/referrals/program-rules";
import { programView } from "@/lib/referrals/affiliate-read-models";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { rulesPublishSchema } from "@/lib/referrals/http/affiliate-operator-schemas";
import { rulesPublishTarget } from "@/lib/referrals/http/affiliate-sensitive-targets";

export const dynamic = "force-dynamic";

/** The active rules version and document (version 0 = built-in defaults, nothing published yet). */
export async function GET(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.rules.read",
    prepare: async () => ({ resource: "affiliate:rules", args: {} }),
    run: async ({ db }) => {
      const { version, rules } = await getActiveRules(db);
      return ok({ version, rules, program: programView(version, rules) });
    },
  });
}

/**
 * Publish a new rules version (sensitive `affiliate.rules.publish`): needs an approval for
 * `{ action: "affiliate.rules.publish", target: { rules, note } }` with the same document, decided by a
 * different operator. New checkouts use the new version; existing attributions keep their snapshot.
 */
export async function POST(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.rules.publish",
    prepare: async () => {
      const input = rulesPublishSchema.parse((await readJsonObject(request)).body);
      const target = rulesPublishTarget(input.rules, input.note);
      return { resource: target.resource, args: target.args, approvalId: input.approvalId, rules: target.rules, note: input.note?.trim() || null };
    },
    run: async ({ db }, { rules, note }, grant) => {
      const published = await publishProgramRules(db, { rules, note, actorUserId: grant.actorUserId });
      return ok({ version: published.version, rules: published.rules, program: programView(published.version, published.rules) }, undefined, 201);
    },
  });
}
