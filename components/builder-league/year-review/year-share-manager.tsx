"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getYearReviewCopy } from "@/content/builder-league/year-review-copy";
import type { SceneKey } from "@/lib/builder-league/year-review";
import { formatClientDate, yearApi } from "./year-api";

export interface ShareLinkView {
  id: string;
  createdAt: string;
  revokedAt: string | null;
}

interface YearShareManagerProps {
  year: number;
  locale: string;
  sceneKeys: SceneKey[];
  initialHidden: string[];
  initialLinks: ShareLinkView[];
  funnel: { visits: number; signups: number; paid: number };
}

/** Member-only controls: which chapters are shared, share links (created, copied, revoked) and their funnel. */
export default function YearShareManager({ year, locale, sceneKeys, initialHidden, initialLinks, funnel }: YearShareManagerProps) {
  const copy = getYearReviewCopy(locale).sharing;
  const scenes = getYearReviewCopy(locale).scenes;
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [links, setLinks] = useState(initialLinks);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const base = `/api/v1/builder-year/${year}`;

  const toggle = (key: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = () => startTransition(async () => {
    const res = await yearApi<{ hiddenScenes: string[] }>(base, { method: "PATCH", body: { hiddenScenes: [...hidden] } });
    setStatus(res.ok ? copy.saved : copy.error);
    if (res.ok) router.refresh();
  });

  const create = () => startTransition(async () => {
    const res = await yearApi<{ link: ShareLinkView; url: string }>(`${base}/share`, { method: "POST", body: { locale } });
    if (!res.ok) return setStatus(copy.error);
    setLinks((current) => [res.data.link, ...current]);
    setNewUrl(res.data.url);
    setCopied(false);
    setStatus(null);
  });

  const revoke = (id: string) => {
    if (!window.confirm(copy.revokeConfirm)) return;
    startTransition(async () => {
      const res = await yearApi<{ link: ShareLinkView }>(`${base}/share/${id}`, { method: "DELETE" });
      if (!res.ok) return setStatus(copy.error);
      setLinks((current) => current.map((link) => (link.id === id ? res.data.link : link)));
    });
  };

  const copyUrl = async () => {
    if (!newUrl) return;
    try {
      await navigator.clipboard.writeText(newUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-8">
      <fieldset className="space-y-3">
        <legend className="text-step-sm font-medium text-ink">{copy.hideLabel}</legend>
        <p className="text-step-xs text-ink-3">{copy.hideHint}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {sceneKeys.map((key) => (
            <li key={key}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-line px-3 py-2 text-step-sm">
                <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={hidden.has(key)} onChange={() => toggle(key)} />
                <span>{scenes[key].title}</span>
              </label>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm" onClick={save} disabled={pending}>{copy.save}</button>
      </fieldset>

      <div className="space-y-3">
        <button type="button" className="btn btn-primary" onClick={create} disabled={pending}>{pending ? copy.creating : copy.createLink}</button>
        {newUrl && (
          <div className="space-y-2 border border-line p-3">
            <p className="text-step-xs text-ink-2">{copy.newLink}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={newUrl} aria-label={copy.newLink} className="min-w-0 flex-1 border border-line bg-transparent px-2 py-2 font-mono text-step-xs" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={copyUrl}>{copied ? copy.copied : copy.copy}</button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-mono text-step-xs uppercase tracking-[0.16em] text-ink-3">{copy.linksHeading}</h3>
        <p className="text-step-sm text-ink-2">{copy.funnel(funnel.visits, funnel.signups, funnel.paid)}</p>
        {links.length === 0 ? (
          <p className="text-step-sm text-ink-3">{copy.noLinks}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-step-sm">
                <span className={link.revokedAt ? "text-ink-3" : "text-ink"}>
                  {link.revokedAt ? copy.revoked(formatClientDate(locale, link.revokedAt)) : copy.created(formatClientDate(locale, link.createdAt))}
                </span>
                {!link.revokedAt && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(link.id)} disabled={pending}>{copy.revoke}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p role="status" aria-live="polite" className="text-step-xs text-ink-2">{status}</p>
    </div>
  );
}
