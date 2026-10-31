import { ok } from "@/lib/builder-league/http";
import { readJsonObject } from "@/lib/live/http/live-request-context";
import { getActiveRules, validateProgramRules } from "@/lib/referrals/program-rules";
import { maxCommissionBps } from "@/lib/referrals/program-math";
import { runAffiliateOperatorRoute } from "@/lib/referrals/http/affiliate-operator-route";
import { rulesPreviewSchema } from "@/lib/referrals/http/affiliate-operator-schemas";

export const dynamic = "force-dynamic";

/** Sample buyer discounts shown per level, in basis points. */
const SAMPLE_DISCOUNTS_BPS = [0, 500, 1000];

/**
 * Validate a rules document without writing anything: the normalized rules (levels sorted), the
 * version publishing would create, and per level the budgets with the commission left at sample discounts.
 */
export async function POST(request: Request) {
  return runAffiliateOperatorRoute({
    request,
    action: "affiliate.rules.preview",
    prepare: async () => {
      const { rules } = rulesPreviewSchema.parse((await readJsonObject(request)).body);
      return { resource: "affiliate:rules", args: {}, rules: validateProgramRules(rules) };
    },
    run: async ({ db }, { rules }) => {
      const { version } = await getActiveRules(db);
      const levels = rules.levels.map((level) => ({
        ...level,
        examples: SAMPLE_DISCOUNTS_BPS.map((discountBps) => ({
          discountBps,
          ordinaryCommissionBps: maxCommissionBps(discountBps, level.ordinaryBudgetBps),
          memberCommissionBps: maxCommissionBps(discountBps, level.memberBudgetBps),
        })),
      }));
      return ok({ valid: true, currentVersion: version, nextVersion: version + 1, rules, levels });
    },
  });
}
