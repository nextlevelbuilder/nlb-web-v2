import { Link } from "@/i18n/navigation";
import { getSeasonsCopy } from "@/content/builder-league/seasons-copy";
import { CAPSULE_BODY_MAX, getCapsuleYear, writableYears } from "@/lib/builder-league/time-capsule";
import { VISIBILITIES } from "@/lib/builder-league/types";
import { TimeCapsuleEditor } from "@/components/builder-league/seasons/time-capsule-editor";
import {
  ProgressionShell,
  formatLeagueDate,
  loadProgressionViewer,
  progressionMetadata,
} from "@/components/builder-league/badges/progression-page";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { capsule } = getSeasonsCopy((await params).locale);
  return progressionMetadata(capsule.metaTitle, capsule.metaDescription);
}

export default async function TimeCapsulePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const copy = getSeasonsCopy(locale).capsule;
  const viewer = await loadProgressionViewer();
  const shell = { locale, section: "timeCapsule" as const, eyebrow: copy.eyebrow, title: copy.title, lede: copy.lede, note: copy.privacyNote };
  if (viewer.status !== "ok") return <ProgressionShell {...shell} viewer={viewer} />;

  const years = writableYears();
  const requested = Number((await searchParams).year);
  const year = years.includes(requested) ? requested : years[1];
  const capsule = await getCapsuleYear(viewer.db, viewer.userId, year);
  const latestIds = new Set([capsule.intent?.id, capsule.reflection?.id]);
  const history = capsule.history.filter((entry) => !latestIds.has(entry.id)).reverse();
  const shared = {
    year,
    maxLength: CAPSULE_BODY_MAX,
    visibilityOptions: VISIBILITIES.map((value) => ({ value, label: copy.visibility[value] })),
    labels: {
      visibility: copy.visibilityLabel,
      save: copy.save,
      saving: copy.saving,
      saved: copy.saved,
      error: copy.saveError,
      characters: copy.characters("{used}", CAPSULE_BODY_MAX),
    },
  };

  return (
    <ProgressionShell {...shell} viewer={viewer}>
      <nav aria-label={copy.yearLabel} className="flex flex-wrap items-center gap-2">
        <span className="mono-label mr-2 text-ink-3">{copy.yearLabel}</span>
        {years.map((option) => (
          <Link
            key={option}
            href={`/builder-league/time-capsule?year=${option}`}
            aria-current={option === year ? "page" : undefined}
            className="seg-option px-3 num-tab focus-ring"
            aria-pressed={option === year}
          >
            {option}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        <TimeCapsuleEditor
          key={`intent-${year}-${capsule.intent?.version ?? 0}`}
          kind="intent"
          heading={copy.intentHeading}
          hint={copy.intentHint}
          initialBody={capsule.intent?.body ?? ""}
          initialVisibility={capsule.intent?.visibility ?? "private"}
          {...shared}
        />
        <TimeCapsuleEditor
          key={`reflection-${year}-${capsule.reflection?.version ?? 0}`}
          kind="reflection"
          heading={copy.reflectionHeading}
          hint={copy.reflectionHint}
          initialBody={capsule.reflection?.body ?? ""}
          initialVisibility={capsule.reflection?.visibility ?? "private"}
          {...shared}
        />
      </div>

      <section aria-labelledby="capsule-history" className="space-y-4">
        <h2 id="capsule-history" className="font-display text-step-2xl">
          {copy.historyHeading}
        </h2>
        {history.length === 0 ? (
          <p className="text-ink-3">{copy.historyEmpty}</p>
        ) : (
          <ol className="space-y-3">
            {history.map((entry) => (
              <li key={entry.id} className="border-l border-line-strong pl-4">
                <p className="font-mono text-step-xs uppercase tracking-[0.08em] text-ink-3 num-tab">
                  {entry.kind === "intent" ? copy.intentHeading : copy.reflectionHeading} ·{" "}
                  {copy.version(entry.version, formatLeagueDate(entry.createdAt, locale))} · {copy.visibility[entry.visibility]}
                </p>
                <p className="mt-1 whitespace-pre-line text-step-sm text-ink-2">{entry.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </ProgressionShell>
  );
}
