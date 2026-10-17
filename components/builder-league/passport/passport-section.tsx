import { Award, ExternalLink, Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { getPassport } from "@/lib/builder-league/passport";
import { STAGES, isEventTypeKey } from "@/lib/builder-league/types";
import { getPassportCopy } from "@/content/builder-league/passport-copy";
import { getLeaderboardCopy } from "@/content/builder-league/leaderboard-copy";
import { getBuilderPageViewer, formatDate } from "@/components/builder-league/home/page-access";

/** Host of an http(s) proof link, or null for anything else (never rendered as a link). */
function linkHost(link: string): string | null {
  try {
    const url = new URL(link);
    return url.protocol === "https:" || url.protocol === "http:" ? url.hostname : null;
  } catch {
    return null;
  }
}

/**
 * The Builder League passport on a builder profile. Visitors see it only when the league is live and
 * the member opted in; the member (and admins) see the private view with a note saying so.
 */
export async function PassportSection({ userId, locale }: { userId: string; locale: string }) {
  const { user, access } = await getBuilderPageViewer();
  if (!access.flagEnabled && !access.canUse) return null;
  const passport = await getPassport(getDb(), userId, user ? { id: user.id, isAdmin: access.isAdmin } : null);
  if (!passport) return null;
  const copy = getPassportCopy(locale);
  const board = getLeaderboardCopy(locale);

  return (
    <section aria-labelledby="builder-passport" className="space-y-8 border-t border-line pt-10">
      <header className="space-y-3">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="builder-passport" className="font-display text-step-2xl font-light">{copy.title}</h2>
        <p className="max-w-[60ch] text-step-sm text-ink-2">{copy.lede}</p>
        {passport.view === "private" && (
          <p className="flex items-start gap-2 text-step-sm text-ink-2">
            <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            {copy.privateNote}
          </p>
        )}
      </header>

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-3">
        <div className="space-y-1 bg-surface p-5">
          <dt className="mono-label text-ink-3">{copy.rank}</dt>
          <dd className="font-display text-step-2xl italic">{board.ranks[passport.rank.key]}</dd>
        </div>
        <div className="space-y-1 bg-surface p-5">
          <dt className="mono-label text-ink-3">{copy.level}</dt>
          <dd className="num-tab font-display text-step-2xl">{passport.level.level}</dd>
          <dd className="num-tab font-mono text-step-xs text-ink-2">{copy.rp(passport.rp)}</dd>
        </div>
        <div className="space-y-2 bg-surface p-5">
          <dt className="mono-label text-ink-3">{copy.stageMix}</dt>
          {STAGES.map((stage) => (
            <dd key={stage} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-step-xs">
              <span className="text-ink-2">{board.stages[stage]}</span>
              <span aria-hidden className="h-1 overflow-hidden rounded-pill bg-line">
                <span className="block h-full bg-primary" style={{ width: `${Math.round(passport.stageMix[stage].share * 100)}%` }} />
              </span>
              <span className="num-tab text-right font-mono">{Math.round(passport.stageMix[stage].share * 100)}%</span>
            </dd>
          ))}
        </div>
      </dl>

      <div className="space-y-4">
        <h3 className="font-display text-step-xl font-normal">{copy.milestones}</h3>
        {passport.milestones.length === 0 ? (
          <p className="text-step-sm text-ink-2">{copy.noMilestones}</p>
        ) : (
          <ol className="surface-panel divide-y divide-line">
            {passport.milestones.map((milestone) => (
              <li key={milestone.eventId} className="space-y-1 p-4">
                <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium">{isEventTypeKey(milestone.eventType) ? copy.eventTypes[milestone.eventType] : milestone.eventType}</span>
                  <span className="font-mono text-step-xs text-ink-3">
                    {board.stages[milestone.stage]} · <time dateTime={milestone.occurredAt}>{formatDate(locale, milestone.occurredAt)}</time>
                  </span>
                </p>
                <p className="break-words text-step-sm text-ink-2">{milestone.title ?? copy.redacted}</p>
                {milestone.links.some(linkHost) && (
                  <ul aria-label={copy.proofLinks} className="flex flex-wrap gap-x-4">
                    {milestone.links.flatMap((link) => {
                      const host = linkHost(link);
                      return host
                        ? [
                            <li key={link} className="min-w-0">
                              <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-[44px] max-w-full items-center gap-1 text-step-sm text-primary hover:underline hover:underline-offset-4">
                                <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{host}</span>
                              </a>
                            </li>,
                          ]
                        : [];
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {(passport.badges.length > 0 || passport.projects.length > 0) && (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {passport.badges.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-step-xl font-normal">{copy.badges}</h3>
              <ul className="flex flex-wrap gap-2">
                {passport.badges.map((badge) => (
                  <li key={`${badge.badgeKey}-${badge.seasonKey}`} className="inline-flex items-center gap-1.5 rounded-pill border border-line-strong px-3 py-1.5 text-step-sm">
                    <Award aria-hidden className="h-3.5 w-3.5 text-primary" />
                    {badge.badgeKey.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {passport.projects.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-step-xl font-normal">{copy.projects}</h3>
              <ul className="space-y-3">
                {passport.projects.map((project) => (
                  <li key={project.id} className="surface-panel space-y-1 p-4">
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{project.name}</span>
                      <span className="mono-label text-ink-3">{board.stages[project.stage]}</span>
                    </p>
                    {project.summary && <p className="text-step-sm text-ink-2">{project.summary}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {passport.view === "private" && (
        <Link href="/builder-league/settings" className="inline-flex min-h-[44px] items-center text-step-sm text-primary hover:underline hover:underline-offset-4">
          {board.you.settings}
        </Link>
      )}
    </section>
  );
}
