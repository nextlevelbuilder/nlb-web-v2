import { ArrowUpRight, Trophy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { getLeaderboardCopy } from "@/content/builder-league/leaderboard-copy";
import { getBuilderRankings } from "@/lib/builder-league/snapshots";
import { getBuilderPageViewer, formatScore } from "@/components/builder-league/home/page-access";

/**
 * The builder entry on the product leaderboards page. Rendered only for viewers who can use the
 * Builder League, so it stays invisible while the league is in its pilot.
 */
export async function BuilderBoardsTab({ locale }: { locale: string }) {
  const { user, access } = await getBuilderPageViewer();
  if (!user || !access.canUse) return null;
  const copy = getLeaderboardCopy(locale);
  let leader: { name: string; score: number } | null = null;
  try {
    const rankings = await getBuilderRankings(getDb(), { board: "overall", period: "week", viewerId: user.id, limit: 1 });
    leader = rankings.entries[0] ?? null;
  } catch (err) {
    console.warn("Builder board preview failed:", err);
  }

  return (
    <aside aria-labelledby="builder-boards-tab" className="surface-panel flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0 space-y-1">
        <p className="mono-label flex items-center gap-1.5 text-ink-3">
          <Trophy aria-hidden className="h-3.5 w-3.5 text-primary" />
          {copy.tab.eyebrow}
        </p>
        <h2 id="builder-boards-tab" className="font-display text-step-xl font-normal">{copy.tab.title}</h2>
        <p className="text-step-sm text-ink-2">{copy.tab.desc}</p>
        {leader && <p className="font-mono text-step-xs text-ink-3">{copy.tab.leader(leader.name, formatScore(locale, leader.score))}</p>}
      </div>
      <Link
        href="/builder-league/leaderboards"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-line-strong px-4 text-step-sm font-medium transition-colors hover:border-foreground"
      >
        {copy.tab.cta}
        <ArrowUpRight aria-hidden className="h-4 w-4" />
      </Link>
    </aside>
  );
}
