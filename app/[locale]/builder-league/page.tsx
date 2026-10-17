import { getDb } from "@/lib/db";
import { getBuilderSummary } from "@/lib/builder-league/passport";
import { getHomeCopy } from "@/content/builder-league/home-copy";
import { requireBuilderPageViewer } from "@/components/builder-league/home/page-access";
import { BuilderAccessPanel } from "@/components/builder-league/home/access-panel";
import { BuilderHome } from "@/components/builder-league/home/builder-home";
import { pageMetadata } from "@/lib/seo";

// Personal, per-request data from D1.
export const dynamic = "force-dynamic";

interface BuilderLeaguePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: BuilderLeaguePageProps) {
  const { locale } = await params;
  const copy = getHomeCopy(locale);
  return { ...pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/builder-league", locale }), robots: { index: false, follow: false } };
}

export default async function BuilderLeaguePage({ params }: BuilderLeaguePageProps) {
  const { locale } = await params;
  const viewer = await requireBuilderPageViewer();
  const copy = getHomeCopy(locale);
  const summary = viewer.user && viewer.access.canUse ? await getBuilderSummary(getDb(), viewer.user.id) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-4xl space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <header className="space-y-5">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="font-display text-step-3xl font-light">{copy.title}</h1>
            <p className="lede max-w-[60ch]">{copy.lede}</p>
          </header>
          {summary ? <BuilderHome summary={summary} locale={locale} /> : <BuilderAccessPanel viewer={viewer} locale={locale} path="/builder-league" />}
        </div>
      </main>
    </div>
  );
}
