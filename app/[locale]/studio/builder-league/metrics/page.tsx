import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getMetricsCopy } from "@/content/builder-league/metrics-copy";
import { MAX_WINDOW_DAYS, getBuilderMetrics, parseMetricsWindow, type MetricsWindow } from "@/lib/builder-league/metrics";
import { BuilderApiError } from "@/lib/builder-league/http";
import { param, requireLeagueAdmin } from "@/components/builder-league/evidence/league-access";
import { LeagueShell, PageHeader, PagePlate, fieldClass, labelClass, privateRobots } from "@/components/builder-league/evidence/evidence-ui";
import { MetricsView } from "@/components/builder-league/metrics/metrics-view";
import { createMetricsFormat } from "@/components/builder-league/metrics/metrics-ui";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: getMetricsCopy(locale).meta.title, robots: privateRobots };
}

/** Builder League tracking dashboard: admins only, everyone else gets a 404. Works without JavaScript. */
export default async function BuilderLeagueMetricsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  const copy = getMetricsCopy(locale);
  const viewer = await requireLeagueAdmin();
  const now = new Date();

  let range: MetricsWindow;
  let invalid = false;
  try {
    range = parseMetricsWindow({ from: param(query.from), to: param(query.to) }, now);
  } catch (err) {
    if (!(err instanceof BuilderApiError)) throw err;
    invalid = true;
    range = parseMetricsWindow({}, now);
  }
  const metrics = await getBuilderMetrics(viewer.db, range, now);
  const format = createMetricsFormat(locale, copy.none);

  return (
    <LeagueShell wide>
      <PagePlate numeral="IV" name={copy.plate} coord={`${range.fromKey} → ${range.toKey}`} />
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        action={
          <Button asChild variant="outline" size="lg" className="h-auto min-h-[52px] gap-2 whitespace-normal">
            <Link href="/studio/builder-league">
              <ArrowLeft aria-hidden className="h-4 w-4" />
              {copy.back}
            </Link>
          </Button>
        }
      />
      <p className="rounded-sm border border-line px-4 py-3 text-step-sm text-ink-2">{copy.adminOnly}</p>

      <form method="get" className="surface-panel space-y-4 p-5">
        <fieldset className="space-y-4">
          <legend className="mono-label text-ink-3">{copy.form.legend}</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="min-w-0">
              <label htmlFor="metrics-from" className={labelClass}>
                {copy.form.from}
              </label>
              <input id="metrics-from" name="from" type="date" required defaultValue={range.fromKey} max={range.toKey} className={`mt-1 ${fieldClass}`} />
            </div>
            <div className="min-w-0">
              <label htmlFor="metrics-to" className={labelClass}>
                {copy.form.to}
              </label>
              <input id="metrics-to" name="to" type="date" required defaultValue={range.toKey} className={`mt-1 ${fieldClass}`} />
            </div>
            <Button type="submit" size="lg">
              {copy.form.apply}
            </Button>
          </div>
          <p className="text-step-xs text-ink-2">{copy.form.hint(MAX_WINDOW_DAYS)}</p>
        </fieldset>
        {invalid ? (
          <p role="alert" className="rounded-sm border border-destructive/60 bg-destructive/10 px-4 py-3 text-step-sm text-foreground">
            {copy.form.invalid}
          </p>
        ) : null}
      </form>

      <div className="num-tab space-y-1 text-step-sm text-ink-2">
        <p>{copy.window(range.fromKey, range.toKey, range.days)}</p>
        <p>{copy.activeMembers(metrics.activeMembers)}</p>
        <p>{copy.generated(format.dateTime(metrics.generatedAt))}</p>
      </div>

      <MetricsView metrics={metrics} copy={copy} locale={locale} />
    </LeagueShell>
  );
}
