import type { MetricsCopy } from "@/content/builder-league/metrics-copy";
import {
  CLAIM_STATUSES,
  NEWCOMER_DAYS,
  RETENTION_OFFSETS,
  SPECIALIST_SHARE,
  type ActivityPeriod,
  type BuilderMetrics,
} from "@/lib/builder-league/metrics";
import { CountStat, DataTable, MetricsSection, RatioCell, RatioStat, StatGrid, createMetricsFormat, type MetricsFormat } from "./metrics-ui";

interface ViewProps {
  metrics: BuilderMetrics;
  copy: MetricsCopy;
  locale: string;
}

function activityRows(periods: ActivityPeriod[], format: MetricsFormat) {
  return periods.map((period) => [
    period.key,
    `${format.date(period.range.start)} – ${format.date(period.range.end)}`,
    <RatioCell key="rate" value={period.active} format={format} />,
  ]);
}

/** Every dashboard section, server-rendered from one `BuilderMetrics` result. */
export function MetricsView({ metrics, copy, locale }: ViewProps) {
  const format = createMetricsFormat(locale, copy.none);
  const lang = locale === "vi" ? "vi" : "en";
  const { northStar, peerHelp, rewards, integrity, wrapped, pilot } = metrics;
  const days = (value: number | null) => (value === null ? copy.none : copy.timeToFirst.days(format.decimal(value)));

  return (
    <div className="space-y-12">
      <MetricsSection id="north-star" numeral="I" title={copy.northStar.title} basis={copy.northStar.basis(northStar.horizonDays)}>
        <StatGrid>
          <RatioStat label={copy.northStar.reached} value={northStar.reached} format={format} note={copy.northStar.pending(northStar.pending, northStar.reachedPending)} />
        </StatGrid>
      </MetricsSection>

      <MetricsSection id="time-to-first" numeral="II" title={copy.timeToFirst.title} basis={copy.timeToFirst.basis}>
        <DataTable
          caption={copy.timeToFirst.title}
          empty={copy.noData}
          head={[copy.columns.signal, copy.columns.reached, copy.columns.medianDays, copy.columns.spread]}
          rows={metrics.timeToFirst.map((row) => [
            copy.timeToFirst.signals[row.key],
            <RatioCell key="reached" value={row.reached} format={format} />,
            days(row.medianDays),
            row.minDays === null ? copy.none : `${format.decimal(row.minDays)} – ${format.decimal(row.maxDays)}`,
          ])}
        />
      </MetricsSection>

      <MetricsSection id="activity" numeral="III" title={copy.activity.title} basis={copy.activity.basis}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {([
            ["weeks", metrics.activity.weeks],
            ["months", metrics.activity.months],
          ] as const).map(([key, periods]) => (
            <div key={key} className="min-w-0 space-y-3">
              <h3 className="mono-label text-ink-3">{copy.activity[key]}</h3>
              <DataTable
                caption={`${copy.activity.title} · ${copy.activity[key]}`}
                empty={copy.noData}
                head={[copy.columns.period, copy.columns.range, copy.columns.members]}
                rows={activityRows(periods, format)}
              />
            </div>
          ))}
        </div>
      </MetricsSection>

      <MetricsSection id="peer-help" numeral="IV" title={copy.peerHelp.title} basis={copy.peerHelp.basis}>
        <StatGrid>
          <RatioStat label={copy.peerHelp.confirmedApproved} value={peerHelp.confirmedApproved} format={format} />
          <CountStat label={copy.peerHelp.reciprocal} value={format.int(peerHelp.reciprocalPairs)} note={copy.peerHelp.reciprocalHint} />
          <CountStat label={copy.peerHelp.helpers} value={`${format.int(peerHelp.helpers)} → ${format.int(peerHelp.helped)}`} note={copy.peerHelp.helped} />
        </StatGrid>
        <DataTable
          caption={copy.peerHelp.title}
          empty={copy.noData}
          head={[copy.columns.step, copy.columns.count]}
          rows={([
            [copy.peerHelp.submitted, peerHelp.submitted],
            [copy.peerHelp.confirmed, peerHelp.confirmed],
            [copy.peerHelp.approved, peerHelp.approved],
            [copy.peerHelp.rejected, peerHelp.rejected],
            [copy.peerHelp.open, peerHelp.open],
            [copy.peerHelp.withdrawn, peerHelp.withdrawn],
          ] as const).map(([label, value]) => [label, format.int(value)])}
        />
      </MetricsSection>

      <MetricsSection id="retention" numeral="V" title={copy.retention.title} basis={copy.retention.basis}>
        <DataTable
          caption={copy.retention.title}
          empty={copy.noData}
          head={[copy.columns.cohort, copy.columns.size, ...RETENTION_OFFSETS.map((n) => copy.retention.offset(n))]}
          rows={metrics.retention.map((cohort) => [
            cohort.cohort,
            format.int(cohort.size),
            ...cohort.months.map((cell, index) =>
              cell ? <RatioCell key={index} value={cell.active} format={format} /> : <span key={index} className="text-ink-3">{copy.notYet}</span>
            ),
          ])}
        />
      </MetricsSection>

      <MetricsSection id="rewards" numeral="VI" title={copy.rewards.title} basis={copy.rewards.basis}>
        <StatGrid>
          <RatioStat label={copy.rewards.total} value={rewards.redeemed} format={format} />
          <RatioStat label={copy.rewards.capacityUsed} value={rewards.capacityUsed} format={format} />
        </StatGrid>
        <DataTable
          caption={copy.rewards.title}
          empty={copy.noData}
          head={[
            copy.columns.reward,
            copy.columns.remaining,
            copy.columns.capacity,
            copy.columns.held,
            ...CLAIM_STATUSES.map((status) => copy.rewards.statuses[status]),
            copy.columns.redeemed,
          ]}
          rows={rewards.items.map((item) => [
            item.title[lang],
            item.remaining === null ? copy.columns.unlimited : format.int(item.remaining),
            item.capacity === null ? copy.columns.unlimited : format.int(item.capacity),
            format.int(item.heldAllTime),
            ...CLAIM_STATUSES.map((status) => format.int(item.claims[status])),
            <RatioCell key="redeemed" value={item.redeemed} format={format} />,
          ])}
        />
      </MetricsSection>

      <MetricsSection id="integrity" numeral="VII" title={copy.integrity.title} basis={copy.integrity.basis}>
        <StatGrid>
          <RatioStat label={copy.integrity.rejection} value={integrity.rejection} format={format} />
          <RatioStat label={copy.integrity.reversals} value={integrity.reversals} format={format} note={copy.integrity.reversedRp(integrity.reversedRp)} />
        </StatGrid>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <h3 className="mono-label text-ink-3">{copy.integrity.reasonsTitle}</h3>
            <DataTable
              caption={copy.integrity.reasonsTitle}
              empty={copy.noData}
              head={[copy.columns.code, copy.columns.count]}
              rows={integrity.reasonCodes.map((row) => [<code key="code">{row.code}</code>, format.int(row.count)])}
            />
          </div>
          <div className="min-w-0 space-y-3">
            <h3 className="mono-label text-ink-3">{copy.integrity.appealsTitle}</h3>
            <DataTable
              caption={copy.integrity.appealsTitle}
              empty={copy.noData}
              head={[copy.columns.step, copy.columns.count]}
              rows={(["opened", "open", "upheld", "overturned", "withdrawn"] as const).map((key) => [copy.integrity.appeals[key], format.int(integrity.appeals[key])])}
            />
          </div>
        </div>
      </MetricsSection>

      <MetricsSection id="wrapped" numeral="VIII" title={copy.wrapped.title} basis={copy.wrapped.basis}>
        <DataTable
          caption={copy.wrapped.title}
          empty={copy.noData}
          head={[copy.columns.step, copy.columns.value]}
          rows={[
            [copy.wrapped.completed, format.int(wrapped.completed)],
            [copy.wrapped.shared, <RatioCell key="shared" value={wrapped.shared} format={format} />],
            [copy.wrapped.visits, format.int(wrapped.visits)],
            [copy.wrapped.signups, <RatioCell key="signups" value={wrapped.signups} format={format} />],
            [copy.wrapped.paid, <RatioCell key="paid" value={wrapped.paid} format={format} />],
          ]}
        />
      </MetricsSection>

      <MetricsSection id="distribution" numeral="IX" title={copy.distribution.title} basis={copy.distribution.basis(NEWCOMER_DAYS, SPECIALIST_SHARE)}>
        <DataTable
          caption={copy.distribution.title}
          empty={copy.noData}
          head={[copy.columns.cohort, copy.columns.members, copy.columns.scored, copy.columns.p25, copy.columns.median, copy.columns.p75, copy.columns.max]}
          rows={metrics.distribution.map((cohort) => [
            copy.distribution.cohorts[cohort.key],
            format.int(cohort.members),
            <RatioCell key="scored" value={cohort.scored} format={format} />,
            format.decimal(cohort.p25),
            format.decimal(cohort.median),
            format.decimal(cohort.p75),
            format.decimal(cohort.max),
          ])}
        />
      </MetricsSection>

      <MetricsSection id="pilot" numeral="X" title={copy.pilot.title} basis={copy.pilot.basis(pilot.weeks)}>
        <p className="rounded-sm border border-line px-4 py-3 text-step-sm text-ink-2">{copy.pilot.caveat}</p>
        <p className="num-tab text-step-sm text-ink-2">{copy.pilot.summary(pilot.enrolled, pilot.evaluated, pilot.pending)}</p>
        <DataTable
          caption={copy.pilot.title}
          empty={copy.noData}
          head={[copy.columns.measure, copy.columns.before, copy.columns.after]}
          rows={[
            [copy.pilot.withEvent, <RatioCell key="b" value={pilot.before.withEvent} format={format} />, <RatioCell key="a" value={pilot.after.withEvent} format={format} />],
            [copy.pilot.events, format.int(pilot.before.events), format.int(pilot.after.events)],
            [copy.pilot.imported, format.int(pilot.before.importedEvents), format.int(pilot.after.importedEvents)],
            [copy.pilot.mean, format.decimal(pilot.before.meanPerMember), format.decimal(pilot.after.meanPerMember)],
            [copy.pilot.median, format.decimal(pilot.before.medianPerMember), format.decimal(pilot.after.medianPerMember)],
          ]}
        />
        <StatGrid>
          <RatioStat label={copy.pilot.improved} value={pilot.improved} format={format} />
          <RatioStat label={copy.pilot.unchanged} value={pilot.unchanged} format={format} />
          <RatioStat label={copy.pilot.declined} value={pilot.declined} format={format} />
        </StatGrid>
      </MetricsSection>
    </div>
  );
}
