import { Link } from "@/i18n/navigation";
import type { MissionsCopy } from "@/content/builder-league/missions-copy";
import type { MissionState } from "@/lib/builder-league/missions";

const STATUS_TONE: Record<MissionState["status"], string> = {
  done: "border-primary text-primary",
  in_review: "border-line-strong text-ink-2",
  recommended: "border-foreground text-foreground",
  available: "border-line text-ink-3",
};

/** One mission: outcome, status and a deep link to the evidence form. Nothing is ever locked. */
export function MissionCard({
  mission,
  copy,
  doneLabel,
  numeral,
}: {
  mission: MissionState;
  copy: MissionsCopy;
  doneLabel: string | null;
  numeral: string;
}) {
  const text = copy.missions[mission.key];
  return (
    <li className="surface-panel flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span aria-hidden className="font-display text-step-lg italic text-primary">
          {numeral}
        </span>
        <span className={`rounded-pill border px-2.5 py-0.5 font-mono text-step-xs uppercase tracking-[0.08em] ${STATUS_TONE[mission.status]}`}>
          {copy.status[mission.status]}
        </span>
      </div>
      <h3 className="font-display text-step-xl">{text.title}</h3>
      <p className="text-step-sm text-ink-2">{text.outcome}</p>
      {mission.revisit ? <p className="mono-label text-ink-3">{copy.page.revisit}</p> : null}
      {doneLabel ? <p className="text-step-sm text-foreground">{doneLabel}</p> : null}
      {mission.status !== "done" && mission.status !== "in_review" ? (
        <Link href={mission.href} className="link-arrow mt-auto self-start text-step-sm focus-ring">
          {copy.page.submit}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </li>
  );
}
