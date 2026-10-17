import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getEvidenceCopy } from "@/content/builder-league/evidence-copy";
import { getModerationSummary } from "@/lib/builder-league/moderation";
import { param, requireLeagueAdmin } from "@/components/builder-league/evidence/league-access";
import { FormResult, LeagueShell, PageHeader, PagePlate, privateRobots } from "@/components/builder-league/evidence/evidence-ui";
import { BackfillForm } from "@/components/builder-league/moderation/moderation-forms";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: getEvidenceCopy(locale).meta.hub, robots: privateRobots };
}

export default async function BuilderLeagueAdminPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  const copy = getEvidenceCopy(locale);
  const viewer = await requireLeagueAdmin();
  const summary = await getModerationSummary(viewer.db);
  const prefix = locale === "vi" ? "/vi" : "";
  const metrics = [
    { label: copy.hub.queue, value: summary.submitted, href: "/studio/builder-league/moderation" },
    { label: copy.hub.needsInfo, value: summary.needsInfo, href: "/studio/builder-league/moderation?status=needs_info" },
    { label: copy.hub.appeals, value: summary.openAppeals, href: "/studio/builder-league/moderation#appeals-title" },
    { label: copy.hub.pilot, value: summary.pilotMembers, href: "/studio/builder-league/moderation#pilot-title" },
  ];

  return (
    <LeagueShell>
      <PagePlate numeral="I" name={copy.plate.hub} coord={viewer.access.flagEnabled ? "ON" : "PILOT"} />
      <PageHeader
        eyebrow={copy.hub.eyebrow}
        title={copy.hub.title}
        lede={copy.hub.lede}
        action={
          <Button asChild size="lg" className="gap-2">
            <Link href="/studio/builder-league/moderation">
              {copy.hub.openQueue}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </Button>
        }
      />
      <FormResult copy={copy} notice={param(query.notice)} error={param(query.error)} />
      <p className="rounded-sm border border-line px-4 py-3 text-step-sm text-ink-2">{viewer.access.flagEnabled ? copy.hub.flagOn : copy.hub.flagOff}</p>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="surface-panel p-5">
            <dt className="mono-label text-ink-3">{metric.label}</dt>
            <dd className="mt-2">
              <Link href={metric.href} className="num-tab font-display text-step-2xl text-foreground hover:text-primary">
                {metric.value}
              </Link>
            </dd>
          </div>
        ))}
      </dl>

      <BackfillForm copy={copy} returnTo={`${prefix}/studio/builder-league`} />
    </LeagueShell>
  );
}
