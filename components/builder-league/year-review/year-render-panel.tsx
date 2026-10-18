"use client";

import { useEffect, useState, useTransition } from "react";
import { getYearReviewCopy } from "@/content/builder-league/year-review-copy";
import { formatClientDate, yearApi } from "./year-api";

export interface RenderJobView {
  id: string;
  format: "9x16" | "16x9";
  status: "queued" | "claimed" | "done" | "failed" | "expired";
  expiresAt: string | null;
}

interface YearRenderPanelProps {
  year: number;
  locale: string;
  initialJobs: RenderJobView[];
  canRender: boolean;
}

const FORMATS = ["9x16", "16x9"] as const;
const POLL_MS = 20_000;

/** Request a video of the shared chapters and download it once the external renderer is done. */
export default function YearRenderPanel({ year, locale, initialJobs, canRender }: YearRenderPanelProps) {
  const copy = getYearReviewCopy(locale).video;
  const [jobs, setJobs] = useState(initialJobs);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const base = `/api/v1/builder-year/${year}/render`;
  const active = jobs.some((job) => job.status === "queued" || job.status === "claimed");

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const res = await yearApi<{ jobs: RenderJobView[] }>(base);
      if (res.ok) setJobs(res.data.jobs);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, base]);

  const request = (format: (typeof FORMATS)[number]) => startTransition(async () => {
    const res = await yearApi<{ job: RenderJobView }>(base, { method: "POST", body: { format } });
    if (!res.ok) return setMessage(res.code === "nothing_to_render" ? copy.nothingToRender : getYearReviewCopy(locale).sharing.error);
    setMessage(null);
    setJobs((current) => [res.data.job, ...current.filter((job) => job.id !== res.data.job.id)]);
  });

  const latest = FORMATS.map((format) => jobs.find((job) => job.format === format)).filter((job): job is RenderJobView => Boolean(job));

  return (
    <div className="space-y-4">
      {canRender ? (
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((format) => (
            <button key={format} type="button" className="btn btn-ghost btn-sm" onClick={() => request(format)} disabled={pending}>
              {copy.request(copy.formats[format])}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-step-sm text-ink-3">{copy.nothingToRender}</p>
      )}
      {latest.length === 0 ? (
        <p className="text-step-sm text-ink-3">{copy.none}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {latest.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-step-sm">
              <span>
                {copy.formats[job.format]} · <span className={job.status === "done" ? "text-primary" : "text-ink-2"}>{copy.statuses[job.status]}</span>
                {job.status === "done" && job.expiresAt && <span className="block text-step-xs text-ink-3">{copy.expires(formatClientDate(locale, job.expiresAt))}</span>}
              </span>
              {job.status === "done" && (
                <span className="flex flex-wrap gap-2">
                  <a className="btn btn-primary btn-sm" href={`${base}/${job.id}/download`}>{copy.download}</a>
                  <a className="btn btn-ghost btn-sm" href={`${base}/${job.id}/download?part=poster`}>{copy.poster}</a>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p role="status" aria-live="polite" className="text-step-xs text-ink-2">{message}</p>
    </div>
  );
}
