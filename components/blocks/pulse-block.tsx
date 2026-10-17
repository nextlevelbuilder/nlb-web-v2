"use client";

import React, { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import type { PulseBlock } from "@/packages/contracts/src";
import type { PulseSummary } from "@/lib/domain/product-pulse";
import { Card } from "@/components/ui/card";

const statusLabels = { up: "Responding", down: "Check failed", unknown: "Unknown", stale: "Stale" };

/** Decorative ECG indicates status; the separate latency chart plots only saved measurements. */
export function PulseMonitor({ status, history, showHistory = true }: { status: PulseSummary["status"]; history: PulseSummary["history"]; showHistory?: boolean }) {
  const samples = [...history].reverse();
  const maxLatency = Math.max(1, ...samples.map(sample => sample.latencyMs ?? 0));
  const colors = { up: "text-success", down: "text-destructive", unknown: "text-ink-3", stale: "text-warning" };
  const bars = { up: "bg-success", down: "bg-destructive", unknown: "bg-ink-3" };
  const points = samples.map((sample, index) => ({
    ...sample,
    x: samples.length === 1 ? 300 : 10 + index * 580 / (samples.length - 1),
    y: sample.latencyMs === null ? null : 68 - (sample.latencyMs / maxLatency) * 52,
  }));
  return <div className="rounded-sm border border-line bg-canvas-deep p-4 space-y-4 overflow-hidden">
    <div className="flex justify-between gap-4 text-xs text-ink-3"><span>Status signal</span><span className={colors[status]}>{statusLabels[status]}</span></div>
    <svg viewBox="0 0 600 90" className={`h-20 w-full ${colors[status]}`} aria-hidden="true" focusable="false" preserveAspectRatio="none">
      {[15, 45, 75].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="currentColor" opacity="0.1" />)}
      <path d={status === "up" ? "M0 45 H80 L94 35 L108 45 H132 L146 66 L160 10 L177 80 L192 45 H276 L290 35 L304 45 H328 L342 66 L356 10 L373 80 L388 45 H472 L486 35 L500 45 H524 L538 66 L552 10 L569 80 L584 45 H600" : "M0 45 H600"}
        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        className={status === "up" ? "motion-safe:animate-pulse" : undefined} strokeDasharray={status === "unknown" || status === "stale" ? "5 7" : undefined} />
    </svg>
    {showHistory && (samples.length > 0 ? <>
      <div className="flex gap-1 h-6" aria-label="Status of recorded checks, oldest to newest">
        {samples.map((sample, index) => <span key={`${sample.checkedAt}-${index}`} className={`flex-1 rounded-sm ${bars[sample.outcome]}`}
          title={`${sample.checkedAt}: ${statusLabels[sample.outcome]}`}><span className="sr-only">{sample.checkedAt}: {statusLabels[sample.outcome]}.</span></span>)}
      </div>
      {points.some(point => point.y !== null) && <>
        <div className="flex justify-between text-xs text-ink-3"><span>Recorded response time</span><span>0–{maxLatency} ms</span></div>
        <svg viewBox="0 0 600 80" className="h-20 w-full text-primary" role="img" aria-label="Recorded latency, oldest to newest. Exact values are listed in check history." preserveAspectRatio="none">
          {points.map((point, index) => {
            const previous = points[index - 1];
            return point.y === null ? null : <g key={point.checkedAt + index}>
              {previous?.y != null && <line x1={previous.x} y1={previous.y} x2={point.x} y2={point.y} stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
              <circle cx={point.x} cy={point.y} r="2.5" fill="currentColor"><title>{`${point.checkedAt}: ${point.latencyMs} ms`}</title></circle>
            </g>;
          })}
        </svg>
      </>}
      <div className="flex justify-between text-xs text-ink-3"><span>Oldest check</span><span>Latest check</span></div>
    </> : <p className="text-xs text-ink-3">No recorded measurements yet.</p>)}
  </div>;
}

export function PulseBlockView({ block, productSlug }: { block: PulseBlock; productSlug?: string }) {
  const [data, setData] = useState<PulseSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    setData(null);
    setUnavailable(false);
    if (!productSlug) return;
    const controller = new AbortController();
    const url = `/api/v1/products/${encodeURIComponent(productSlug)}/pulse`;
    setLoading(true);
    void (async () => {
      try {
        const saved = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!saved.ok) throw new Error("Pulse unavailable");
        const { data: summary } = await saved.json() as { data: PulseSummary };
        setData(summary);
        if (!summary.nextCheckAt || Date.parse(summary.nextCheckAt) <= Date.now()) {
          const response = await fetch(url, { method: "POST", signal: controller.signal });
          if (!response.ok) throw new Error("Pulse unavailable");
          const { data: updated } = await response.json() as { data: PulseSummary };
          setData(updated);
        }
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [productSlug]);

  // Re-evaluate freshness while the page stays open; measurements are on-view only.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const status = data?.checkedAt && now - Date.parse(data.checkedAt) > 15 * 60_000 ? "stale" : data?.status || "unknown";
  return (
    <section className="w-full my-6 space-y-4" aria-label={block.props.title || "Pulse"}>
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3 className="font-display text-step-xl">{block.props.title || "Pulse"}</h3>
      </div>
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <strong aria-live="polite">{statusLabels[status]}</strong>
          {loading && <span className="text-xs text-ink-2">Checking…</span>}
        </div>
        <PulseMonitor status={status} history={data?.history || []} showHistory={block.props.showHistory} />
        {!productSlug && <p className="text-sm text-ink-2">Measurements appear after this product is published. Pulse checks its saved website.</p>}
        {unavailable && <p role="status" className="text-sm text-ink-2">Monitoring is temporarily unavailable. Any results below are previously saved samples.</p>}
        {data && <>
          <p className="break-all text-xs text-ink-2">{data.websiteUrl}</p>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div><dt className="text-xs text-ink-2">Last response</dt><dd className="font-semibold">{data.latencyMs === null ? "Unknown" : `${data.latencyMs} ms`}</dd></div>
            <div><dt className="text-xs text-ink-2">Sampled uptime</dt><dd className="font-semibold">{data.sampleUptimePercent === null ? "Unknown" : `${data.sampleUptimePercent}%`}</dd></div>
            <div><dt className="text-xs text-ink-2">Measured checks</dt><dd className="font-semibold">{data.measuredSampleCount} / {data.sampleCount}</dd></div>
          </dl>
          <p className="text-xs text-ink-2">{data.checkedAt ? <>Last checked <time dateTime={data.checkedAt}>{new Date(data.checkedAt).toLocaleString()}</time>.</> : "No checks recorded yet."} Checks run on visits, at most every five minutes. Sampled uptime counts successful measured checks, excludes unknown results, and is not continuous availability.</p>
          {data.windowStartedAt && <p className="text-xs text-ink-2">History begins <time dateTime={data.windowStartedAt}>{new Date(data.windowStartedAt).toLocaleString()}</time>. Up to 100 recent checks are retained.</p>}
          {block.props.showHistory && data.history.length > 0 && <details>
            <summary className="cursor-pointer text-sm font-medium">Check history ({data.history.length})</summary>
            <ol className="mt-3 space-y-2 max-h-64 overflow-auto" aria-label="Pulse check history">
              {data.history.map((sample, index) => <li key={`${sample.checkedAt}-${index}`} className="flex flex-wrap gap-x-3 text-xs">
                <time dateTime={sample.checkedAt} className="text-ink-2">{new Date(sample.checkedAt).toLocaleString()}</time>
                <span>{statusLabels[sample.outcome]}</span>
                {sample.latencyMs !== null && <span>{sample.latencyMs} ms</span>}
                {sample.httpStatus !== null && <span>HTTP {sample.httpStatus}</span>}
                {sample.reason && <span className="text-ink-2">{sample.reason.replaceAll("_", " ")}</span>}
              </li>)}
            </ol>
          </details>}
        </>}
      </Card>
    </section>
  );
}
