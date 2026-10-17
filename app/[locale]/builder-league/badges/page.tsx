import { getBadgesCopy } from "@/content/builder-league/badges-copy";
import { buildBadgeViews, evaluateBadges, getBadgeAwards, getBadgeShareCard, type BadgeView } from "@/lib/builder-league/badges";
import { BadgeMedallion } from "@/components/builder-league/badges/badge-medallion";
import { ShareCardButton } from "@/components/builder-league/badges/share-card-button";
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

export async function generateMetadata({ params }: PageProps) {
  const { page } = getBadgesCopy((await params).locale);
  return progressionMetadata(page.metaTitle, page.metaDescription);
}

export default async function BadgesPage({ params }: PageProps) {
  const { locale } = await params;
  const copy = getBadgesCopy(locale);
  const lang = locale === "vi" ? "vi" : "en";
  const viewer = await loadProgressionViewer();
  const shell = { locale, section: "badges" as const, eyebrow: copy.page.eyebrow, title: copy.page.title, lede: copy.page.lede, note: copy.page.rules };
  if (viewer.status !== "ok") return <ProgressionShell {...shell} viewer={viewer} />;

  await evaluateBadges(viewer.db, viewer.userId);
  const views = buildBadgeViews(await getBadgeAwards(viewer.db, viewer.userId), lang);
  const earned = views.filter((view) => view.earned || view.seasons.length > 0);
  const locked = views.filter((view) => !view.earned && view.seasons.length === 0);
  const shareTexts = new Map<string, string>();
  await Promise.all(
    earned.map(async (view) => {
      const awardId = view.earned?.awardId ?? view.seasons.at(-1)?.awardId;
      if (!awardId) return;
      const card = await getBadgeShareCard(viewer.db, awardId, viewer.userId, lang);
      if (card) {
        shareTexts.set(
          view.key,
          [card.name, copy.page.plateLabel(card.numeral), card.seasonKey, copy.page.earnedOn(formatLeagueDate(card.awardedAt, locale)), "Next Level Builders · Builder League"]
            .filter(Boolean)
            .join(" · ")
        );
      }
    })
  );

  return (
    <ProgressionShell {...shell} viewer={viewer}>
      <p className="mono-label text-ink-2 num-tab">{copy.page.earnedCount(earned.length, views.length)}</p>

      <section aria-labelledby="badges-earned" className="space-y-6">
        <h2 id="badges-earned" className="font-display text-step-2xl">
          {copy.page.earnedHeading}
        </h2>
        {earned.length === 0 ? (
          <p className="text-ink-2">{copy.page.none}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {earned.map((view) => (
              <BadgeCard key={view.key} view={view} locale={locale} shareText={shareTexts.get(view.key)} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="badges-locked" className="space-y-6">
        <h2 id="badges-locked" className="font-display text-step-2xl">
          {copy.page.lockedHeading}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locked.map((view) => (
            <BadgeCard key={view.key} view={view} locale={locale} />
          ))}
        </ul>
      </section>
    </ProgressionShell>
  );
}

function BadgeCard({ view, locale, shareText }: { view: BadgeView; locale: string; shareText?: string }) {
  const copy = getBadgesCopy(locale);
  const isEarned = Boolean(view.earned || view.seasons.length);
  return (
    <li className="surface-panel flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <BadgeMedallion
          badgeKey={view.key}
          numeral={view.numeral}
          rarity={view.rarity}
          earned={isEarned}
          seasonal={view.seasons.length > 0}
          className="h-20 w-20 shrink-0"
        />
        <div className="min-w-0 space-y-1">
          <p className="mono-label text-ink-3">
            {copy.page.plateLabel(view.numeral)} · {copy.stages[view.stage]} · {copy.rarity[view.rarity]}
          </p>
          <h3 className="font-display text-step-xl">{view.name}</h3>
        </div>
      </div>
      <p className="text-step-sm text-ink-2">{view.description}</p>
      <div className="space-y-1">
        <p className="mono-label text-ink-3">{copy.page.criteria}</p>
        <p className="text-step-sm text-ink-2">{view.criteria}</p>
      </div>
      {view.seasonalName ? <p className="text-step-sm text-ink-3">{copy.page.seasonal(view.seasonalName)}</p> : null}
      {view.earned ? (
        <p className="text-step-sm text-foreground">
          {copy.page.earnedOn(formatLeagueDate(view.earned.awardedAt, locale))} · {copy.page.evidence(view.earned.evidenceCount)}
        </p>
      ) : null}
      {view.seasons.length ? (
        <p className="text-step-sm text-foreground">
          {copy.page.seasonsEarned}: <span className="font-mono num-tab">{view.seasons.map((s) => s.seasonKey).join(", ")}</span>
        </p>
      ) : null}
      {shareText ? (
        <div className="mt-auto space-y-1 border-t border-line pt-3">
          <p className="text-step-xs text-ink-3">{copy.page.shareCardHint}</p>
          <ShareCardButton text={shareText} label={copy.page.copyCard} copiedLabel={copy.page.copied} />
        </div>
      ) : null}
    </li>
  );
}
