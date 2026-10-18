import type { PublicYearReview, YearMilestone, YearReviewData, YearScene } from "@/lib/builder-league/year-review";
import { eventTypeLabel, type JourneyCopy } from "@/content/builder-league/journey-copy";
import { romanNumeral, type YearReviewCopy } from "@/content/builder-league/year-review-copy";
import { badgeLabel } from "@/lib/builder-league/badges";
import { formatDateKey, formatLocalDate, formatNumber } from "../journey/journey-format";

type SceneMilestone = Pick<YearMilestone, "eventId" | "eventType" | "stage" | "occurredAt" | "localDate" | "projectName" | "title" | "backfill" | "provenanceLabel">;

/** What a scene list needs, from either the private review or its public subset. */
export interface YearScenesModel {
  year: number;
  scenes: YearScene[];
  milestones: SceneMilestone[];
  stats: { verifiedMilestones: number; projects: number; activeWeeks: number; rp?: number; peopleHelped?: number; learnings: number };
  archetype: YearReviewData["archetype"];
  standoutDay: YearReviewData["standoutDay"];
  peerMentions: YearReviewData["peerMentions"];
  nextYearNote: string | null;
  badges: YearReviewData["badges"];
  ranks: YearReviewData["ranks"];
}

export function privateScenesModel(data: YearReviewData): YearScenesModel {
  const note = data.reflection.nextYearIntent ?? data.reflection.reflection ?? data.reflection.intent;
  return { ...data, nextYearNote: note?.body ?? null };
}

export function publicScenesModel(data: PublicYearReview): YearScenesModel {
  return { ...data, stats: { ...data.stats } };
}

interface YearScenesProps {
  model: YearScenesModel;
  copy: YearReviewCopy;
  journeyCopy: JourneyCopy;
  locale: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line pt-3">
      <dt className="font-mono text-step-xs uppercase tracking-[0.16em] text-ink-3">{label}</dt>
      <dd className="font-display text-step-2xl font-light text-ink">{value}</dd>
    </div>
  );
}

/** The Year in Review as numbered atlas plates, one per scene that has a real milestone. */
export default function YearScenes({ model, copy, journeyCopy, locale }: YearScenesProps) {
  const byId = new Map(model.milestones.map((m) => [m.eventId, m]));
  const n = (value: number) => formatNumber(locale, value);

  return (
    <ol className="space-y-10">
      {model.scenes.map((scene, index) => {
        const sceneCopy = copy.scenes[scene.key];
        const milestones = scene.eventIds.map((id) => byId.get(id)).filter((m): m is SceneMilestone => Boolean(m));
        const headingId = `scene-${scene.key}`;
        return (
          <li key={scene.key} aria-labelledby={headingId} className="surface-panel space-y-5 p-5 sm:p-8">
            <div className="plate">
              <span className="rn">{romanNumeral(index + 1)}</span>
              <span aria-hidden className="rule" />
              <span className="coord font-mono text-step-xs text-ink-3">
                {scene.occurredAt ? formatLocalDate(locale, scene.occurredAt) : model.year}
              </span>
            </div>
            <div className="space-y-2">
              <h3 id={headingId} className="font-display text-step-xl font-light italic">{sceneCopy.title}</h3>
              <p className="max-w-[60ch] text-step-sm text-ink-2">{sceneCopy.caption}</p>
            </div>

            {scene.key === "year_in_numbers" && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Stat label={copy.stats.milestones} value={n(model.stats.verifiedMilestones)} />
                <Stat label={copy.stats.projects} value={n(model.stats.projects)} />
                <Stat label={copy.stats.activeWeeks} value={n(model.stats.activeWeeks)} />
                {model.stats.learnings > 0 && <Stat label={copy.stats.learnings} value={n(model.stats.learnings)} />}
                {typeof model.stats.peopleHelped === "number" && model.stats.peopleHelped > 0 && <Stat label={copy.stats.peopleHelped} value={n(model.stats.peopleHelped)} />}
                {typeof model.stats.rp === "number" && <Stat label={copy.stats.rp} value={n(model.stats.rp)} />}
              </dl>
            )}

            {scene.key === "year_in_numbers" && model.archetype && (
              <p className="text-step-sm text-ink-2">
                <span className="font-display text-step-lg italic text-ink">{copy.archetypes[model.archetype.key].name}</span>
                {" · "}
                {copy.archetypes[model.archetype.key].line}
                <span className="mt-1 block text-step-xs text-ink-3">{copy.archetypeNote}</span>
              </p>
            )}
            {scene.key === "year_in_numbers" && model.standoutDay && (
              <p className="text-step-sm text-ink-2">{copy.standoutDay(formatDateKey(locale, model.standoutDay.date), model.standoutDay.count)}</p>
            )}

            {scene.key === "league_highlights" && (
              <ul className="flex flex-wrap gap-2 text-step-sm">
                {model.ranks.map((rank) => (
                  <li key={`rank-${rank.rank}`} className="border border-line px-3 py-1">{journeyCopy.ranks[rank.rank]}</li>
                ))}
                {model.badges.map((badge) => (
                  <li key={`badge-${badge.badgeKey}-${badge.seasonKey}`} className="border border-line px-3 py-1">{badgeLabel(badge.badgeKey, locale)}</li>
                ))}
              </ul>
            )}

            {scene.key === "next_year" && (
              <blockquote className="border-l-2 border-primary pl-4 font-display text-step-lg italic text-ink">
                {model.nextYearNote ?? copy.nextYear.empty}
              </blockquote>
            )}

            {milestones.length > 0 && (
              <ul className="space-y-2">
                {milestones.map((m) => (
                  <li key={m.eventId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-2 text-step-sm">
                    <span className="font-mono text-step-xs text-ink-3">{formatDateKey(locale, m.localDate)}</span>
                    <span className="font-medium text-ink">{m.title ?? eventTypeLabel(journeyCopy, m.eventType)}</span>
                    {m.projectName && <span className="text-ink-2">{m.projectName}</span>}
                    {m.backfill && (
                      <span className="font-mono text-step-xs text-ink-3">{journeyCopy.backfill(m.provenanceLabel, formatDateKey(locale, m.localDate))}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {scene.key === "community_impact" && model.peerMentions.length > 0 && (
              <p className="text-step-sm text-ink-2">
                <span className="font-mono text-step-xs uppercase tracking-[0.16em] text-ink-3">{copy.peers}: </span>
                {model.peerMentions.map((peer) => peer.name).join(", ")}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
