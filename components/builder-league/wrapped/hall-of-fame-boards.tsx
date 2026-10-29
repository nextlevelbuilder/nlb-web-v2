import { Hash } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { HallOfFameBoard, HallOfFameEntry } from "@/lib/builder-league/hall-of-fame";
import type { HallOfFameCopy } from "@/content/builder-league/hall-of-fame-copy";
import { romanNumeral } from "@/content/builder-league/year-review-copy";
import { formatScore } from "@/components/builder-league/home/page-access";

interface HallOfFameBoardsProps {
  year: number;
  boards: HallOfFameBoard[];
  copy: HallOfFameCopy;
  locale: string;
}

/** One listed member: the name links to the passport only when the member made it public. */
function MemberRow({ entry, copy, locale, showPrevious }: { entry: HallOfFameEntry; copy: HallOfFameCopy; locale: string; showPrevious: boolean }) {
  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 py-3">
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
            <Link href={`/builders/${entry.userId}`} className="inline-flex min-h-[24px] max-w-full items-center truncate font-medium hover:text-primary hover:underline hover:underline-offset-4">
              {entry.name}
            </Link>
          ) : (
            <p className="truncate font-medium">{entry.name}</p>
          )}
          <p className="truncate font-mono text-step-xs text-ink-3">{copy.events(entry.verifiedEventCount)}</p>
        </div>
      </div>
      <p className="text-right">
        <span className="num-tab block font-display text-step-lg">{copy.score(formatScore(locale, entry.score))}</span>
        {showPrevious && entry.previousScore !== undefined && (
          <span className="num-tab block font-mono text-step-xs text-ink-3">{copy.previousScore(formatScore(locale, entry.previousScore))}</span>
        )}
      </p>
    </li>
  );
}

/** The frozen boards of one year as numbered atlas plates: the overall board first, full width. */
export default function HallOfFameBoards({ year, boards, copy, locale }: HallOfFameBoardsProps) {
  return (
    <ol className="grid gap-6 md:grid-cols-2">
      {boards.map((board, index) => {
        const label = copy.boards[board.board];
        const headingId = `hof-${board.board}`;
        return (
          <li key={board.board} className={`surface-panel flex flex-col gap-4 p-5 sm:p-7 ${board.board === "overall" ? "md:col-span-2" : ""}`}>
            <section aria-labelledby={headingId} className="flex flex-1 flex-col gap-4">
              <div className="plate">
                <span className="rn">{romanNumeral(index + 1)}</span>
                <span aria-hidden className="rule" />
                <span className="coord font-mono text-step-xs text-ink-3">{year}</span>
              </div>
              <div className="space-y-1">
                <h2 id={headingId} className="font-display text-step-xl font-light italic">{label.label}</h2>
                <p className="text-step-sm text-ink-2">{label.description}</p>
              </div>
              {board.entries.length === 0 ? (
                <p className="text-step-sm text-ink-3">{copy.empty}</p>
              ) : (
                <ol className="divide-y divide-line border-t border-line">
                  {board.entries.map((entry) => (
                    <MemberRow key={entry.userId} entry={entry} copy={copy} locale={locale} showPrevious={board.board === "rising"} />
                  ))}
                </ol>
              )}
              <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 font-mono text-[0.65rem] leading-relaxed text-ink-3">
                <span>{copy.revisionMeta(board.revision, board.rulesetVersion)}</span>
                <span className="inline-flex min-w-0 items-center gap-1" title={board.eventHash}>
                  <Hash aria-hidden className="h-3 w-3 text-primary" />
                  {copy.auditHash} {board.eventHash.slice(0, 12)}…
                </span>
              </p>
            </section>
          </li>
        );
      })}
    </ol>
  );
}
