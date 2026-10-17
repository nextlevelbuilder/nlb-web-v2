import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { shareFunnel } from "@/lib/builder-league/attribution";
import { listRenderJobs, serializeRenderJob } from "@/lib/builder-league/render-jobs";
import { listShareLinks, serializeShareLink } from "@/lib/builder-league/share-links";
import { localYear } from "@/lib/builder-league/time-windows";
import { isReviewableYear, requirePrivatePageViewer } from "@/lib/builder-league/wrapped-access";
import { ensureYearSnapshot, snapshotData, toPublicYearReview } from "@/lib/builder-league/year-review";
import { getJourneyCopy } from "@/content/builder-league/journey-copy";
import { getYearReviewCopy } from "@/content/builder-league/year-review-copy";
import YearScenes, { privateScenesModel, publicScenesModel } from "@/components/builder-league/year-review/year-scenes";
import YearShareManager from "@/components/builder-league/year-review/year-share-manager";
import YearRenderPanel from "@/components/builder-league/year-review/year-render-panel";
import { formatDateKey } from "@/components/builder-league/journey/journey-format";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

interface YearPageProps {
  params: Promise<{ locale: string; year: string }>;
}

function parseYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return isReviewableYear(year, localYear(new Date())) ? year : null;
}

export async function generateMetadata({ params }: YearPageProps): Promise<Metadata> {
  const { locale, year } = await params;
  const copy = getYearReviewCopy(locale);
  return { title: copy.metaTitle(Number(year) || 0), description: copy.metaDescription, robots: { index: false, follow: false } };
}

export default async function YearReviewPage({ params }: YearPageProps) {
  const { locale, year: yearParam } = await params;
  const year = parseYear(yearParam);
  if (!year) notFound();
  const db = getDb();
  const user = await requirePrivatePageViewer(locale, `/builder-league/year/${year}`, db);
  const copy = getYearReviewCopy(locale);
  const journeyCopy = getJourneyCopy(locale);

  const { snapshot } = await ensureYearSnapshot(db, user.id, year, new Date());
  const data = snapshotData(snapshot);
  const shared = toPublicYearReview(data, snapshot.hiddenScenes);
  const [links, funnel, jobs] = await Promise.all([
    listShareLinks(db, user.id, { kind: "year_review", year }),
    shareFunnel(db, user.id, year),
    listRenderJobs(db, user.id, year),
  ]);
  const statusNote = snapshot.status === "final" ? copy.status.finalNote : copy.status.provisionalNote;

  return (
    <main id="main" className="sky-backdrop flex-1">
      <div className="wrap space-y-14 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
        <header className="max-w-3xl space-y-5">
          <p className="eyebrow">{copy.eyebrow(year)}</p>
          <h1 className="font-display text-step-3xl font-light">{copy.title(year)}</h1>
          <p className="lede max-w-[60ch]">{copy.lede}</p>
          <p className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 font-mono text-step-xs text-ink-3">
            <span className={snapshot.status === "final" ? "text-primary" : "text-ink-2"}>{copy.status[snapshot.status]}</span>
            <span>{copy.versionMeta(snapshot.version, snapshot.rulesetVersion)}</span>
          </p>
          <p className="text-step-sm text-ink-2">{statusNote}</p>
          <Link className="link-arrow text-step-sm" href="/builder-league/journey">{copy.journeyLink}</Link>
        </header>

        {data.milestones.length === 0 ? (
          <section className="surface-panel px-6 py-16 text-center">
            <h2 className="font-display text-step-xl font-normal">{copy.empty.title}</h2>
            <p className="mt-2 text-step-sm text-ink-2">{copy.empty.body}</p>
          </section>
        ) : (
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section aria-label={copy.title(year)} className="min-w-0">
              <YearScenes model={privateScenesModel(data)} copy={copy} journeyCopy={journeyCopy} locale={locale} />
            </section>
            <aside className="min-w-0 space-y-10 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
              <section aria-labelledby="year-missing" className="space-y-2 text-step-sm text-ink-2">
                <h2 id="year-missing" className="font-mono text-step-xs uppercase tracking-[0.16em] text-ink-3">{copy.missing.heading}</h2>
                {data.missing.scenes.length > 0 && (
                  <p>{copy.missing.body} {data.missing.scenes.map((key) => copy.scenes[key].title).join(", ")}.</p>
                )}
                {data.missing.untrackedBeforeTrackedFrom && data.missing.trackedFrom && <p>{copy.missing.untracked(formatDateKey(locale, data.missing.trackedFrom))}</p>}
                {data.provenance.backfill && <p>{copy.missing.backfill(data.provenance.backfill.count, data.provenance.backfill.labels.join(", "))}</p>}
              </section>
            </aside>
          </div>
        )}

        <section aria-labelledby="year-share" className="grid gap-10 border-t border-line pt-10 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <div className="plate"><span className="rn">∗</span><span aria-hidden className="rule" /><span className="coord font-mono text-step-xs text-ink-3">{year}</span></div>
            <h2 id="year-share" className="font-display text-step-2xl font-light">{copy.sharing.heading}</h2>
            <p className="text-step-sm text-ink-2">{copy.sharing.intro}</p>
            <p className="text-step-xs text-ink-3">{copy.sharing.visibilityHint}</p>
            <YearShareManager
              year={year}
              locale={locale}
              sceneKeys={data.scenes.map((scene) => scene.key)}
              initialHidden={snapshot.hiddenScenes}
              initialLinks={links.map(serializeShareLink)}
              funnel={funnel}
            />
          </div>
          <div className="min-w-0 space-y-4">
            <h3 className="font-mono text-step-xs uppercase tracking-[0.16em] text-ink-3">{copy.sharing.preview}</h3>
            {shared.scenes.length === 0 ? (
              <p className="text-step-sm text-ink-3">{copy.sharing.previewEmpty}</p>
            ) : (
              <div tabIndex={0} role="region" aria-label={copy.sharing.preview} className="max-h-[36rem] overflow-y-auto pr-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <YearScenes model={publicScenesModel(shared)} copy={copy} journeyCopy={journeyCopy} locale={locale} />
              </div>
            )}
            <div className="space-y-3 border-t border-line pt-6">
              <h3 className="font-display text-step-xl font-light">{copy.video.heading}</h3>
              <p className="text-step-sm text-ink-2">{copy.video.intro}</p>
              <YearRenderPanel year={year} locale={locale} initialJobs={jobs.map(serializeRenderJob)} canRender={shared.scenes.length > 0} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
