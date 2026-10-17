import { getBadgesCopy } from "@/content/builder-league/badges-copy";
import { getSeasonsCopy } from "@/content/builder-league/seasons-copy";
import { SEASON_GOAL_MAX, SEASON_TRACKS, getSeasonOverview } from "@/lib/builder-league/seasons";
import { STAGES, isBoardKey } from "@/lib/builder-league/types";
import { SeasonEnrollForm } from "@/components/builder-league/seasons/season-enroll-form";
import {
  ProgressionShell,
  formatLeagueDate,
  loadProgressionViewer,
  progressionMetadata,
} from "@/components/builder-league/badges/progression-page";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { page } = getSeasonsCopy((await params).locale);
  return progressionMetadata(page.metaTitle, page.metaDescription);
}

export default async function SeasonsPage({ params }: PageProps) {
  const { locale } = await params;
  const copy = getSeasonsCopy(locale);
  const page = copy.page;
  const stages = getBadgesCopy(locale).stages;
  const viewer = await loadProgressionViewer();
  const shell = { locale, section: "seasons" as const, eyebrow: page.eyebrow, title: page.title, lede: page.lede, note: page.fairness };
  if (viewer.status !== "ok") return <ProgressionShell {...shell} viewer={viewer} />;

  const { season, enrollment, checkIns, archive } = await getSeasonOverview(viewer.db, viewer.userId);
  const boardName = (board: string) => (isBoardKey(board) ? page.boardNames[board] : board);

  return (
    <ProgressionShell {...shell} viewer={viewer}>
      <section aria-labelledby="season-current" className="surface-panel space-y-6 p-5 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="season-current" className="font-display text-step-2xl">
            {page.seasonName(season.number)}
          </h2>
          <p className="mono-label text-ink-2">
            {page.status[season.status]}
            {season.status === "active" ? <span className="num-tab"> · {page.weekOf(season.week, season.weeks)}</span> : null}
          </p>
        </div>
        <p className="font-mono text-step-xs text-ink-3 num-tab">
          {page.dates(formatLeagueDate(season.start, locale), formatLeagueDate(season.end, locale))}
        </p>
        {season.status === "active" ? (
          <ol aria-hidden className="grid grid-cols-8 gap-1">
            {Array.from({ length: season.weeks }, (_, i) => (
              <li key={i} className={`h-1 rounded-pill ${i < season.week ? "bg-primary" : "bg-line"}`} />
            ))}
          </ol>
        ) : null}
        <div className="space-y-3 border-t border-line pt-6">
          <h3 className="font-display text-step-xl">{enrollment ? page.joinedHeading : page.joinHeading}</h3>
          <p className="max-w-[60ch] text-step-sm text-ink-2">{page.joinBody}</p>
          <SeasonEnrollForm
            seasonKey={season.key}
            tracks={SEASON_TRACKS.map((track) => ({ value: track, ...copy.tracks[track] }))}
            initialTrack={enrollment?.track ?? "open"}
            initialGoal={enrollment?.goal ?? ""}
            goalMax={SEASON_GOAL_MAX}
            labels={{
              track: page.trackLabel,
              goal: page.goalLabel,
              goalHint: page.goalHint,
              submit: enrollment ? page.update : page.join,
              saving: page.saving,
              saved: page.saved,
              error: page.saveError,
            }}
          />
        </div>
      </section>

      <section aria-labelledby="season-checkin" className="space-y-5">
        <h2 id="season-checkin" className="font-display text-step-2xl">
          {page.checkInHeading}
        </h2>
        <p className="max-w-[60ch] text-ink-2">{page.checkInBody}</p>
        {checkIns.length === 0 ? (
          <p className="text-ink-3">{page.checkInEmpty}</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {checkIns.map((week) => {
              const total = STAGES.reduce((sum, stage) => sum + week.verified[stage], 0);
              return (
                <li key={week.weekKey} className={`surface-panel space-y-2 p-4 ${week.current ? "border-primary" : ""}`}>
                  <p className="mono-label flex justify-between gap-2 text-ink-3">
                    <span>{page.weekLabel(week.week)}</span>
                    {week.current ? <span className="text-primary">{page.thisWeek}</span> : null}
                  </p>
                  {week.quiet && total === 0 ? (
                    <p className="text-step-sm text-ink-3">{page.quiet}</p>
                  ) : (
                    <ul className="space-y-0.5 text-step-sm">
                      {STAGES.filter((stage) => week.verified[stage] > 0).map((stage) => (
                        <li key={stage} className="flex justify-between gap-2">
                          <span className="text-ink-2">{stages[stage]}</span>
                          <span className="font-mono num-tab">{week.verified[stage]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {week.inReview > 0 ? <p className="text-step-xs text-ink-3 num-tab">{page.inReview(week.inReview)}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="season-archive" className="space-y-5">
        <h2 id="season-archive" className="font-display text-step-2xl">
          {page.archiveHeading}
        </h2>
        {archive.length === 0 ? (
          <p className="text-ink-3">{page.archiveEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {archive.map((entry) => (
              <li key={entry.seasonKey} className="surface-panel space-y-2 p-4">
                <p className="flex flex-wrap justify-between gap-2">
                  <span className="font-display text-step-lg">{page.seasonName(entry.number)}</span>
                  <span className="mono-label text-ink-3">{page.boards(entry.boards.length)}</span>
                </p>
                {entry.myPlacements.length ? (
                  <ul className="flex flex-wrap gap-x-5 gap-y-1 text-step-sm num-tab">
                    {entry.myPlacements.map((placement) => (
                      <li key={placement.board}>{page.myPlace(boardName(placement.board), placement.place, placement.entrants)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-step-sm text-ink-3">{page.notPlaced}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ProgressionShell>
  );
}
