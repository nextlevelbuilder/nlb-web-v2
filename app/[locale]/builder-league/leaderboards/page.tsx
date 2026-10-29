import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { getDb } from "@/lib/db";
import { getBuilderRankingsForPage, type BuilderRankingsPage } from "@/lib/builder-league/snapshots";
import { BuilderApiError } from "@/lib/builder-league/http";
import { getLeaderboardCopy } from "@/content/builder-league/leaderboard-copy";
import { requireBuilderPageViewer } from "@/components/builder-league/home/page-access";
import { BuilderAccessPanel } from "@/components/builder-league/home/access-panel";
import { BoardView } from "@/components/builder-league/leaderboard/board-view";
import { pageMetadata } from "@/lib/seo";

// Reads (and may compute) league snapshots in D1 per request.
export const dynamic = "force-dynamic";

interface BuilderBoardsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);

export async function generateMetadata({ params }: BuilderBoardsPageProps) {
  const { locale } = await params;
  const copy = getLeaderboardCopy(locale);
  return { ...pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/builder-league/leaderboards", locale }), robots: { index: false, follow: false } };
}

export default async function BuilderBoardsPage({ params, searchParams }: BuilderBoardsPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const viewer = await requireBuilderPageViewer();
  const copy = getLeaderboardCopy(locale);

  let rankings: BuilderRankingsPage | null = null;
  if (viewer.user && viewer.access.canUse) {
    try {
      rankings = await getBuilderRankingsForPage(getDb(), {
        board: single(query.board),
        period: single(query.period),
        key: single(query.key),
        viewerId: viewer.user.id,
      });
    } catch (err) {
      if (err instanceof BuilderApiError) notFound();
      throw err;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-4xl space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <header className="space-y-5">
            <p className="eyebrow">
              <Trophy aria-hidden className="h-3.5 w-3.5 text-primary" />
              {copy.eyebrow}
            </p>
            <h1 className="font-display text-step-3xl font-light">{copy.title}</h1>
            <p className="lede max-w-[60ch]">{copy.lede}</p>
          </header>
          {rankings ? <BoardView rankings={rankings} locale={locale} /> : <BuilderAccessPanel viewer={viewer} locale={locale} path="/builder-league/leaderboards" />}
        </div>
      </main>
    </div>
  );
}
