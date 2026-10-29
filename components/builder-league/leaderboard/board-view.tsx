import { ChevronLeft, ChevronRight, Hash, Lock, TrendingUp, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getLeaderboardCopy } from "@/content/builder-league/leaderboard-copy";
import type { BuilderRankingsPage } from "@/lib/builder-league/snapshots";
import { BOARD_KEYS, PERIOD_TYPES, type BoardKey, type PeriodType } from "@/lib/builder-league/types";
import { formatDate, formatScore } from "@/components/builder-league/home/page-access";

const PATH = "/builder-league/leaderboards";
const href = (board: BoardKey, period: PeriodType, key?: string | null) => ({
  pathname: PATH,
  query: key ? { board, period, key } : { board, period },
});

function Segments<T extends string>({ label, items, current, labelFor, hrefFor }: {
  label: string;
  items: readonly T[];
  current: T;
  labelFor: (item: T) => string;
  hrefFor: (item: T) => ReturnType<typeof href>;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = item === current;
          return (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-pill border px-4 text-step-sm transition-colors ${
                  active ? "border-foreground bg-foreground text-background" : "border-line-strong text-ink-2 hover:border-foreground hover:text-foreground"
                }`}
              >
                {labelFor(item)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A Builder League board: board and period switches (plain links), snapshot meta, entries and the viewer's own row. */
export function BoardView({ rankings, locale }: { rankings: BuilderRankingsPage; locale: string }) {
  const copy = getLeaderboardCopy(locale);
  const { board, periodType, periodKey, snapshot, entries, viewer } = rankings;
  const showPrevious = board === "rising";

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Segments label={copy.boardNav} items={BOARD_KEYS} current={board} labelFor={(b) => copy.boards[b].label} hrefFor={(b) => href(b, periodType)} />
        <Segments label={copy.periodNav} items={PERIOD_TYPES} current={periodType} labelFor={(p) => copy.periods[p]} hrefFor={(p) => href(board, p)} />
      </div>

      <header className="space-y-3 border-t border-line pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-step-xl font-normal">
            {copy.boards[board].label} · <span className="num-tab">{periodKey}</span>
          </h2>
          <nav aria-label={copy.periodNav} className="flex gap-2">
            {rankings.previousKey ? (
              <Link href={href(board, periodType, rankings.previousKey)} className="inline-flex min-h-[44px] items-center gap-1 rounded-pill border border-line-strong px-3 text-step-sm text-ink-2 hover:border-foreground hover:text-foreground">
                <ChevronLeft aria-hidden className="h-4 w-4" />
                {copy.previous}
              </Link>
            ) : null}
            {rankings.nextKey ? (
              <Link href={href(board, periodType, rankings.nextKey)} className="inline-flex min-h-[44px] items-center gap-1 rounded-pill border border-line-strong px-3 text-step-sm text-ink-2 hover:border-foreground hover:text-foreground">
                {copy.next}
                <ChevronRight aria-hidden className="h-4 w-4" />
              </Link>
            ) : null}
          </nav>
        </div>
        <p className="text-step-sm text-ink-2">{copy.boards[board].description}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-step-xs text-ink-3">
          <p className={snapshot.status === "final" ? "text-foreground" : "text-ink-2"}>
            {copy.status[snapshot.status]} · {copy.revision(snapshot.revision)}
          </p>
          <dl className="contents">
          <div className="flex gap-1.5">
            <dt>{copy.ruleset}</dt>
            <dd className="text-ink-2">{snapshot.rulesetVersion}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>{copy.updated}</dt>
            <dd className="text-ink-2">{formatDate(locale, snapshot.watermarkAt)}</dd>
          </div>
          <div className="flex min-w-0 gap-1.5" title={snapshot.eventHash}>
            <dt className="flex items-center gap-1">
              <Hash aria-hidden className="h-3 w-3 text-primary" />
              {copy.auditHash}
            </dt>
            <dd className="text-ink-2">{snapshot.eventHash.slice(0, 12)}…</dd>
          </div>
          </dl>
        </div>
      </header>

      {viewer !== null && (
        <section aria-labelledby="your-position" className="surface-panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <h3 id="your-position" className="mono-label text-ink-3">{copy.you.title}</h3>
            <p className="num-tab font-display text-step-2xl">{copy.you.position(viewer.position, viewer.outOf)}</p>
            <p className="flex items-center gap-1.5 text-step-sm text-ink-2">
              {viewer.isPublic ? <Users aria-hidden className="h-3.5 w-3.5" /> : <Lock aria-hidden className="h-3.5 w-3.5" />}
              {viewer.isPublic ? copy.you.listed : copy.you.hidden}
            </p>
          </div>
          <div className="space-y-1 text-right">
            <p className="num-tab font-display text-step-xl">{formatScore(locale, viewer.score)}</p>
            <p className="font-mono text-step-xs text-ink-3">{copy.events(viewer.verifiedEventCount)}</p>
            <Link href="/builder-league/settings" className="inline-flex min-h-[44px] items-center text-step-sm text-primary hover:underline hover:underline-offset-4">
              {copy.you.settings}
            </Link>
          </div>
        </section>
      )}
      {viewer === null && <p className="text-step-sm text-ink-2">{copy.you.notRanked}</p>}

      {entries.length === 0 ? (
        <div className="surface-panel px-6 py-14 text-center">
          <TrendingUp aria-hidden className="mx-auto mb-4 h-10 w-10 text-ink-3" strokeWidth={1.25} />
          <h3 className="font-display text-step-xl font-normal">{copy.emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-[52ch] text-step-sm text-ink-2">{copy.emptyDesc}</p>
        </div>
      ) : (
        <ol className="surface-panel divide-y divide-line">
          {entries.map((entry) => (
            <li key={entry.userId} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 p-4 sm:p-5">
              <span
                aria-label={copy.rankLabel(entry.rank)}
                className={`text-center font-display text-step-xl italic leading-none ${entry.rank <= 3 ? "text-primary" : "text-ink-3"}`}
              >
                {entry.rank}
              </span>
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-background font-display text-primary sm:flex">
                  {entry.image ? <img src={entry.image} alt="" width={40} height={40} className="h-full w-full object-cover" /> : <span aria-hidden>{entry.name.charAt(0).toUpperCase()}</span>}
                </span>
                <div className="min-w-0">
                  {entry.passportPublic ? (
                    <Link href={`/builders/${entry.userId}`} className="block truncate font-medium hover:text-primary hover:underline hover:underline-offset-4">
                      {entry.name}
                    </Link>
                  ) : (
                    <span className="block truncate font-medium">{entry.name}</span>
                  )}
                  <p className="truncate font-mono text-step-xs text-ink-3">{copy.events(entry.verifiedEventCount)}</p>
                </div>
              </div>
              <p className="text-right">
                <span className="num-tab block font-display text-step-lg">{formatScore(locale, entry.score)}</span>
                {showPrevious && entry.previousScore !== undefined && (
                  <span className="num-tab block font-mono text-step-xs text-ink-3">{copy.previousScore(formatScore(locale, entry.previousScore))}</span>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
