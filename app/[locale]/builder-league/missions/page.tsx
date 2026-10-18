import { getBadgesCopy } from "@/content/builder-league/badges-copy";
import { getMissionsCopy } from "@/content/builder-league/missions-copy";
import { getMissionPlan } from "@/lib/builder-league/missions";
import { STAGES } from "@/lib/builder-league/types";
import { MissionCard } from "@/components/builder-league/missions/mission-card";
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

const NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];

export async function generateMetadata({ params }: PageProps) {
  const { page } = getMissionsCopy((await params).locale);
  return progressionMetadata(page.metaTitle, page.metaDescription);
}

export default async function MissionsPage({ params }: PageProps) {
  const { locale } = await params;
  const copy = getMissionsCopy(locale);
  const stages = getBadgesCopy(locale).stages;
  const viewer = await loadProgressionViewer();
  const shell = { locale, section: "missions" as const, eyebrow: copy.page.eyebrow, title: copy.page.title, lede: copy.page.lede, note: copy.page.noPressure };
  if (viewer.status !== "ok") return <ProgressionShell {...shell} viewer={viewer} />;

  const plan = await getMissionPlan(viewer.db, viewer.userId);
  const byKey = new Map(plan.missions.map((mission, index) => [mission.key, { mission, numeral: NUMERALS[index] ?? String(index + 1) }]));
  const doneLabel = (completedAt: string | null) => (completedAt ? copy.page.doneOn(formatLeagueDate(completedAt, locale)) : null);

  return (
    <ProgressionShell {...shell} viewer={viewer}>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 border-y border-line py-4 font-mono text-step-xs uppercase tracking-[0.08em] text-ink-3">
        <div className="flex gap-1.5">
          <dt className="sr-only">Stage</dt>
          <dd className="text-foreground">{copy.page.nowIn(stages[plan.currentStage])}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="sr-only">Cycle</dt>
          <dd className="num-tab">{copy.page.cycle(plan.cycle)}</dd>
        </div>
      </dl>
      {plan.loopedBack ? <p className="surface-panel max-w-2xl p-4 text-step-sm text-ink-2">{copy.page.loopedBack}</p> : null}

      {plan.recommended.length ? (
        <section aria-labelledby="missions-next" className="space-y-5">
          <h2 id="missions-next" className="font-display text-step-2xl">
            {copy.page.nextHeading}
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {plan.recommended.map((key) => {
              const entry = byKey.get(key);
              return entry ? <MissionCard key={key} mission={entry.mission} copy={copy} numeral={entry.numeral} doneLabel={null} /> : null;
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="missions-all" className="space-y-8">
        <h2 id="missions-all" className="font-display text-step-2xl">
          {copy.page.allHeading}
        </h2>
        {STAGES.map((stage) => {
          const missions = plan.missions.filter((mission) => mission.stage === stage);
          if (!missions.length) return null;
          return (
            <div key={stage} className="space-y-4">
              <h3 className="flex items-center gap-4 mono-label text-ink-3">
                {copy.page.stageHeading[stage]}
                <span aria-hidden className="plate-rule" />
              </h3>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {missions.map((mission) => (
                  <MissionCard
                    key={mission.key}
                    mission={mission}
                    copy={copy}
                    numeral={byKey.get(mission.key)?.numeral ?? ""}
                    doneLabel={doneLabel(mission.completedAt)}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </ProgressionShell>
  );
}
