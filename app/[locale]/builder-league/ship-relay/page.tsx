import { Link } from "@/i18n/navigation";
import { getMissionsCopy } from "@/content/builder-league/missions-copy";
import { missionHref } from "@/lib/builder-league/missions";
import { getRelayOverview } from "@/components/builder-league/relay/relay-data";
import { ConfirmHelpButton } from "@/components/builder-league/relay/confirm-help-button";
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
  const { relay } = getMissionsCopy((await params).locale);
  return progressionMetadata(relay.metaTitle, relay.metaDescription);
}

export default async function ShipRelayPage({ params }: PageProps) {
  const { locale } = await params;
  const copy = getMissionsCopy(locale).relay;
  const viewer = await loadProgressionViewer();
  const shell = { locale, section: "shipRelay" as const, eyebrow: copy.eyebrow, title: copy.title, lede: copy.lede, note: copy.rules };
  if (viewer.status !== "ok") return <ProgressionShell {...shell} viewer={viewer} />;

  const relay = await getRelayOverview(viewer.db, viewer.userId);

  return (
    <ProgressionShell {...shell} viewer={viewer}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
        <p className="font-mono text-step-xs uppercase tracking-[0.08em] text-ink-2 num-tab">
          {copy.totals(relay.totals.confirmed, relay.totals.builders)}
        </p>
        <Link href={missionHref("contribute_peer_help")} className="btn btn-primary btn-sm focus-ring">
          {copy.logHelp}
        </Link>
      </div>

      <section aria-labelledby="relay-awaiting" className="space-y-4">
        <h2 id="relay-awaiting" className="font-display text-step-2xl">
          {copy.awaitingHeading}
        </h2>
        {relay.awaiting.length === 0 ? (
          <p className="text-ink-3">{copy.awaitingEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {relay.awaiting.map((item) => (
              <li key={item.evidenceId} className="surface-panel space-y-3 p-5">
                <p className="mono-label text-ink-3">
                  {copy.awaitingFrom(item.otherName)} · {formatLeagueDate(item.occurredAt, locale)}
                </p>
                <p className="font-display text-step-lg">{item.title}</p>
                <ConfirmHelpButton
                  evidenceId={item.evidenceId}
                  labels={{ confirm: copy.confirm, confirming: copy.confirming, confirmed: copy.confirmed, error: copy.confirmError }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="relay-given" className="space-y-4">
        <h2 id="relay-given" className="font-display text-step-2xl">
          {copy.givenHeading}
        </h2>
        {relay.given.length === 0 ? (
          <p className="text-ink-3">{copy.givenEmpty}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {relay.given.map((item) => (
              <li key={item.evidenceId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{item.title}</span>
                  <span className="text-step-sm text-ink-3">
                    {copy.helped(item.otherName)} · {formatLeagueDate(item.occurredAt, locale)}
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-3 font-mono text-step-xs uppercase tracking-[0.08em]">
                  <span className={item.confirmed ? "text-primary" : "text-ink-3"}>{item.confirmed ? copy.confirmedBadge : copy.waitingBadge}</span>
                  <span className="text-ink-2">{copy.evidenceStatus[item.status as keyof typeof copy.evidenceStatus] ?? item.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="relay-feed" className="space-y-4">
        <h2 id="relay-feed" className="font-display text-step-2xl">
          {copy.feedHeading}
        </h2>
        {relay.feed.length === 0 ? (
          <p className="text-ink-3">{copy.feedEmpty}</p>
        ) : (
          <ol className="space-y-3">
            {relay.feed.map((item) => (
              <li key={item.evidenceId} className="border-l border-primary pl-4">
                <p className="mono-label text-ink-3">
                  {copy.feedItem(item.helperName ?? copy.someone, item.helpedName ?? copy.someone)} · {formatLeagueDate(item.occurredAt, locale)}
                </p>
                <p className="mt-1">{item.title}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </ProgressionShell>
  );
}
