import { ArrowUpRight, Check, Circle, Compass, FileCheck2, IdCard, Route, ShieldCheck, Trophy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getHomeCopy } from "@/content/builder-league/home-copy";
import { getLeaderboardCopy } from "@/content/builder-league/leaderboard-copy";
import type { BuilderSummary } from "@/lib/builder-league/passport";
import { STAGES } from "@/lib/builder-league/types";
import { formatDate, formatScore } from "./page-access";

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

/** The member home: level, rank progress, this week, a getting-started checklist and league links. */
export function BuilderHome({ summary, locale }: { summary: BuilderSummary; locale: string }) {
  const copy = getHomeCopy(locale);
  const board = getLeaderboardCopy(locale);
  const { level, rank } = summary;
  const progress = Math.round(level.progress * 100);
  const anyPublic = summary.privacy.leaderboardPublic || summary.privacy.passportPublic;

  const checklist = [
    { label: copy.checklist.privacy, href: "/builder-league/settings", done: anyPublic },
    { label: copy.checklist.evidence, href: "/builder-league/evidence", done: summary.pendingEvidence > 0 || summary.rp > 0 },
    { label: copy.checklist.mission, href: "/builder-league/missions", done: false },
    { label: copy.checklist.journey, href: "/builder-league/journey", done: false },
  ];
  const links: { label: string; desc: string; href: string; icon: typeof Compass; count?: number }[] = [
    { ...copy.links.missions, href: "/builder-league/missions", icon: Compass },
    { label: copy.links.evidence.label, desc: copy.links.evidence.desc(summary.pendingEvidence), href: "/builder-league/evidence", icon: FileCheck2, count: summary.pendingEvidence },
    { ...copy.links.journey, href: "/builder-league/journey", icon: Route },
    { ...copy.links.leaderboards, href: "/builder-league/leaderboards", icon: Trophy },
    { ...copy.links.passport, href: `/builders/${summary.userId}`, icon: IdCard },
    { ...copy.links.settings, href: "/builder-league/settings", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-12">
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-3">
        <div className="space-y-2 bg-surface p-5">
          <dt className="mono-label text-ink-3">{copy.level.label}</dt>
          <dd className="font-display text-step-2xl">{copy.level.value(level.level)}</dd>
          <dd>
            <div
              role="progressbar"
              aria-label={copy.level.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-1.5 overflow-hidden rounded-pill bg-line"
            >
              <div className="h-full rounded-pill bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </dd>
          <dd className="font-mono text-step-xs text-ink-2">
            <span className="num-tab">{copy.level.rp(summary.rp)}</span> · {level.rpToNext === null ? copy.level.max : copy.level.rpToNext(level.rpToNext)}
          </dd>
        </div>
        <div className="space-y-2 bg-surface p-5">
          <dt className="mono-label text-ink-3">{copy.rank.label}</dt>
          <dd className="font-display text-step-2xl italic">{board.ranks[rank.current]}</dd>
          {rank.awardedAt && <dd className="font-mono text-step-xs text-ink-2">{copy.rank.since(formatDate(locale, rank.awardedAt))}</dd>}
          {rank.inactive && <dd className="text-step-sm text-ink-2">{copy.rank.inactive}</dd>}
        </div>
        <div className="space-y-2 bg-surface p-5">
          <dt className="mono-label text-ink-3">
            {copy.week.label} · <span className="num-tab">{summary.week.periodKey}</span>
          </dt>
          <dd className="flex items-baseline gap-2">
            <span className="num-tab font-display text-step-2xl">{formatScore(locale, summary.week.score)}</span>
            <span className="font-mono text-step-xs text-ink-2">{copy.week.unit}</span>
          </dd>
          <dd>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-step-xs text-ink-2">
              {STAGES.map((stage) => (
                <li key={stage}>
                  {board.stages[stage]} <span className="num-tab text-foreground">{formatScore(locale, summary.week.components[stage])}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="rank-progress" className="space-y-4">
        <h2 id="rank-progress" className="font-display text-step-xl font-normal">
          {rank.next ? copy.rank.nextTitle(board.ranks[rank.next]) : copy.rank.atTop}
        </h2>
        {rank.eligible !== rank.current && <p className="text-step-sm text-ink-2">{copy.rank.eligibleNote}</p>}
        {rank.nextRequirements.length > 0 && (
          <ul className="surface-panel divide-y divide-line">
            {rank.nextRequirements.map((requirement) => (
              <li key={requirement.key} className="flex items-start gap-3 p-4">
                {requirement.met ? (
                  <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Circle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
                )}
                <span className="min-w-0 flex-1 text-step-sm">{copy.rank.requirement[requirement.key](requirement.required, requirement.actual)}</span>
                <span className={`mono-label shrink-0 ${requirement.met ? "text-success" : "text-ink-3"}`}>{requirement.met ? copy.rank.met : copy.rank.notMet}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="getting-started" className="space-y-4">
        <h2 id="getting-started" className="font-display text-step-xl font-normal">{copy.checklist.title}</h2>
        <ol className="surface-panel divide-y divide-line">
          {checklist.map((item, index) => (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-[44px] items-center gap-4 p-4 transition-colors hover:bg-primary/5">
                <span aria-hidden className="w-6 font-mono text-step-xs text-primary">{ROMAN[index]}</span>
                <span className={`min-w-0 flex-1 text-step-sm ${item.done ? "text-ink-2 line-through decoration-line-strong" : ""}`}>{item.label}</span>
                {item.done ? <Check aria-label={copy.rank.met} className="h-4 w-4 shrink-0 text-success" /> : <ArrowUpRight aria-hidden className="h-4 w-4 shrink-0 text-ink-3" />}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <nav aria-labelledby="league-links" className="space-y-4">
        <h2 id="league-links" className="font-display text-step-xl font-normal">{copy.links.title}</h2>
        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {links.map(({ label, desc, href, icon: Icon, count }) => (
            <li key={href} className="bg-surface">
              <Link href={href} className="group flex h-full min-h-[44px] flex-col gap-2 p-5 transition-colors hover:bg-primary/5">
                <span className="flex items-center gap-2 font-medium">
                  <Icon aria-hidden className="h-4 w-4 text-primary" />
                  {label}
                  {count ? <span className="num-tab rounded-pill border border-line-strong px-2 font-mono text-step-xs text-foreground">{count}</span> : null}
                </span>
                <span className="text-step-sm text-ink-2">{desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
