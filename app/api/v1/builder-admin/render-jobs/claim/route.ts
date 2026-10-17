import { getDb } from "@/lib/db";
import { ok, withBuilderErrors } from "@/lib/builder-league/http";
import { claimNextRenderJob, serializeRenderJobForAdmin } from "@/lib/builder-league/render-jobs";
import { requireRenderer } from "@/lib/builder-league/admin-key-auth";
import { journeyCopy } from "@/content/builder-league/journey-copy";
import { yearReviewCopy } from "@/content/builder-league/year-review-copy";
import { wrappedCopy } from "@/content/builder-league/wrapped-copy";
import { siteUrl } from "@/lib/seo";
import { BADGES } from "@/lib/builder-league/badges";

export const dynamic = "force-dynamic";

/** Plain-string labels the external renderer needs, per locale, so it never duplicates site copy. */
function renderLabels() {
  return Object.fromEntries(
    (["en", "vi"] as const).map((locale) => {
      const year = yearReviewCopy[locale];
      const shared = wrappedCopy[locale].shared;
      return [locale, {
        kicker: year.eyebrow(0).split(" · ")[1] ?? "",
        // Templates keep the `{name}` and `{year}` slots so the renderer fills them without copying site copy.
        titleTemplate: shared.title("{name}", 9999).replace("9999", "{year}"),
        unknownName: shared.unknownName,
        outroTitle: shared.cta,
        outroBody: shared.ctaBody,
        status: year.status,
        milestones: year.stats.milestones,
        projects: year.stats.projects,
        activeWeeks: year.stats.activeWeeks,
        scenes: year.scenes,
        archetypes: Object.fromEntries(Object.entries(year.archetypes).map(([key, value]) => [key, value.name])),
        eventTypes: journeyCopy[locale].eventTypes,
        stages: journeyCopy[locale].stages,
        ranks: journeyCopy[locale].ranks,
        badges: Object.fromEntries(BADGES.map((badge) => [badge.key, badge.name[locale]])),
      }];
    })
  );
}

/**
 * POST /api/v1/builder-admin/render-jobs/claim — leases the next due render job to the caller and
 * returns the public-safe scenes to render, or `{ job: null }` when the queue is empty.
 */
export async function POST(request: Request) {
  return withBuilderErrors(async () => {
    const db = getDb();
    await requireRenderer(request, db);
    const claimed = await claimNextRenderJob(db);
    if (!claimed) return ok({ job: null });
    return ok({
      job: serializeRenderJobForAdmin(claimed.job),
      lease: claimed.lease,
      displayName: claimed.displayName,
      review: claimed.review,
      labels: renderLabels(),
      site: siteUrl(),
    });
  });
}
