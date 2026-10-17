import { Link } from "@/i18n/navigation";
import { getBadgesCopy } from "@/content/builder-league/badges-copy";
import { getKillBoard } from "@/lib/builder-league/kill-board";
import { missionHref } from "@/lib/builder-league/missions";
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
  const { killBoard } = getBadgesCopy((await params).locale);
  return progressionMetadata(killBoard.metaTitle, killBoard.metaDescription);
}

export default async function KillBoardPage({ params }: PageProps) {
  const { locale } = await params;
  const copy = getBadgesCopy(locale).killBoard;
  const viewer = await loadProgressionViewer();
  const shell = { locale, section: "killBoard" as const, eyebrow: copy.eyebrow, title: copy.title, lede: copy.lede, note: copy.consent };
  if (viewer.status !== "ok") return <ProgressionShell {...shell} viewer={viewer} />;

  const entries = await getKillBoard(viewer.db);
  const shareHref = missionHref("validate_stop_pivot");

  return (
    <ProgressionShell {...shell} viewer={viewer}>
      <Link href={shareHref} className="link-arrow text-step-sm focus-ring">
        {copy.shareCta}
        <span aria-hidden>→</span>
      </Link>
      {entries.length === 0 ? (
        <p className="text-ink-2">{copy.empty}</p>
      ) : (
        <ol className="space-y-4">
          {entries.map((entry, index) => (
            <li key={entry.evidenceId} className="surface-panel grid gap-4 p-5 sm:grid-cols-[4rem_1fr] sm:p-6">
              <span aria-hidden className="font-display text-step-2xl italic leading-none text-primary num-tab">
                {String(index + 1).padStart(2, "0")}
              </span>
              <article className="min-w-0 space-y-3">
                <header className="space-y-1">
                  <p className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-step-xs uppercase tracking-[0.08em] text-ink-3">
                    <span>{entry.author?.name ?? copy.anonymous}</span>
                    <span>{formatLeagueDate(entry.occurredAt, locale)}</span>
                    <span>{copy.visibility[entry.visibility]}</span>
                    {entry.ideaSlayer ? <span className="text-primary">{copy.ideaSlayer}</span> : null}
                  </p>
                  <h2 className="font-display text-step-xl">{entry.title}</h2>
                  {entry.projectName ? <p className="text-step-sm text-ink-3">{copy.project(entry.projectName)}</p> : null}
                </header>
                <p className="whitespace-pre-line text-ink-2">{entry.learning}</p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </ProgressionShell>
  );
}
