import type { CommunityWrappedData } from "@/lib/builder-league/community-wrapped";
import { romanNumeral } from "@/content/builder-league/year-review-copy";
import type { WrappedCopy } from "@/content/builder-league/wrapped-copy";
import { formatLocalDate, formatNumber } from "../journey/journey-format";

interface CommunityMetricsProps {
  data: CommunityWrappedData;
  copy: WrappedCopy["community"];
  locale: string;
}

/** Community Wrapped figures as atlas plates, each with how it was counted. */
export default function CommunityMetrics({ data, copy, locale }: CommunityMetricsProps) {
  const n = (value: number) => formatNumber(locale, value);
  return (
    <div className="space-y-10">
      <ol className="grid gap-6 md:grid-cols-2">
        {data.metrics.map((metric, index) => {
          const label = copy.metrics[metric.key];
          return (
            <li key={metric.key} className="surface-panel flex flex-col gap-4 p-5 sm:p-7">
              <div className="plate">
                <span className="rn">{romanNumeral(index + 1)}</span>
                <span aria-hidden className="rule" />
                <span className="coord font-mono text-step-xs text-ink-3">{data.year}</span>
              </div>
              <h3 className="font-display text-step-xl font-light italic">{label.label}</h3>
              {metric.suppressed || metric.value === null ? (
                <p className="text-step-sm text-ink-3">{copy.suppressed(data.minCohort)}</p>
              ) : (
                <div>
                  <p className="font-display text-step-3xl font-light text-ink">{n(metric.value)}</p>
                  <p className="text-step-sm text-ink-2">{label.unit}</p>
                  {metric.denominator && metric.key === "active_validators" && (
                    <p className="mt-1 text-step-xs text-ink-3">{copy.share(metric.value, metric.denominator.value)}</p>
                  )}
                  {typeof metric.extra.membersHelped === "number" && (
                    <p className="mt-1 text-step-xs text-ink-3">{copy.membersHelped(metric.extra.membersHelped)}</p>
                  )}
                </div>
              )}
              <p className="mt-auto border-t border-line pt-3 font-mono text-[0.65rem] leading-relaxed text-ink-3">
                {copy.source(metric.eventTypes.join(", "), metric.verification.join(", "))}
              </p>
            </li>
          );
        })}
      </ol>
      <section aria-labelledby="wrapped-method" className="space-y-2 border-t border-line pt-6 text-step-sm text-ink-2">
        <h2 id="wrapped-method" className="font-mono text-step-xs uppercase tracking-[0.16em] text-ink-3">{copy.methodHeading}</h2>
        <p className="max-w-[70ch]">{copy.method(data.minCohort)}</p>
        <p>{copy.timeframe(formatLocalDate(locale, data.timeframe.start), formatLocalDate(locale, Math.min(data.timeframe.cutoffAt, data.timeframe.end)), data.timeframe.timeZone)}</p>
        {data.backfilledEvents > 0 && <p>{copy.backfill(data.backfilledEvents)}</p>}
      </section>
    </div>
  );
}
