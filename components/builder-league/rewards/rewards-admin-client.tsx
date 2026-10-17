"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

export interface AdminItem {
  id: string;
  key: string;
  kind: string;
  kindLabel: string;
  title: { en: string; vi: string };
  description: { en: string; vi: string };
  eligibility: unknown;
  inventory: number | null;
  budgetNote: string | null;
  availableFrom: string | null;
  availableUntil: string | null;
  windowLabel: string;
  active: boolean;
}

export interface AdminClaim {
  id: string;
  memberName: string;
  rewardTitle: string;
  periodKey: string;
  status: string;
  statusLabel: string;
  note: string | null;
  createdLabel: string;
  actions: string[];
}

export interface AdminAward {
  id: string;
  memberName: string;
  badgeLabel: string;
  awardedLabel: string;
  revokeReason: string | null;
}

export interface RewardsAdminLabels {
  seed: string;
  seeding: string;
  seeded: { none: string; some: string };
  itemsHeading: string;
  itemsEmpty: string;
  active: string;
  inactive: string;
  activate: string;
  deactivate: string;
  inventory: string;
  inventoryUnlimited: string;
  setInventory: string;
  budget: string;
  window: string;
  claimsHeading: string;
  claimsEmpty: string;
  filterLabel: string;
  allStatuses: string;
  member: string;
  reward: string;
  period: string;
  requested: string;
  actions: string;
  note: string;
  actionLabels: Record<string, string>;
  badgesHeading: string;
  badgesBody: string;
  badgesEmpty: string;
  revoke: string;
  revokeReason: string;
  revokedPrefix: string;
  working: string;
  done: string;
  error: string;
}

interface Props {
  locale: "en" | "vi";
  items: AdminItem[];
  claims: AdminClaim[];
  awards: AdminAward[];
  statuses: { value: string; label: string }[];
  status: string;
  labels: RewardsAdminLabels;
}

async function post(url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as { data?: unknown; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(json?.error?.message ?? String(response.status));
  return json?.data;
}

/** Rewards studio: catalogue toggles and stock, claim decisions and badge revocations. Every call is audited server-side. */
export function RewardsAdminClient({ locale, items, claims, awards, statuses, status, labels }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function run(key: string, action: () => Promise<string | void>) {
    setBusy(key);
    setMessage(labels.working);
    try {
      const result = await action();
      setMessage(result || labels.done);
      router.refresh();
    } catch (err) {
      setMessage(`${labels.error}${err instanceof Error && err.message ? ` (${err.message})` : ""}`);
    } finally {
      setBusy(null);
    }
  }

  const saveItem = (item: AdminItem, patch: Partial<Pick<AdminItem, "active" | "inventory">>) =>
    post("/api/v1/builder-admin/rewards/items", {
      key: item.key,
      kind: item.kind,
      title: item.title,
      description: item.description,
      eligibility: item.eligibility,
      inventory: item.inventory,
      budgetNote: item.budgetNote,
      availableFrom: item.availableFrom,
      availableUntil: item.availableUntil,
      active: item.active,
      ...patch,
    });

  return (
    <div className="space-y-12">
      <p role="status" aria-live="polite" className="min-h-6 text-step-sm text-ink-2">
        {message}
      </p>

      <section aria-labelledby="admin-items" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="admin-items" className="font-display text-step-2xl">
            {labels.itemsHeading}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm focus-ring"
            disabled={busy !== null}
            onClick={() =>
              run("seed", async () => {
                const data = (await post("/api/v1/builder-admin/rewards/seed")) as { created: string[] };
                return data.created.length ? labels.seeded.some.replace("{count}", String(data.created.length)) : labels.seeded.none;
              })
            }
          >
            {busy === "seed" ? labels.seeding : labels.seed}
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-ink-3">{labels.itemsEmpty}</p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {items.map((item) => (
              <li key={item.id} className="surface-panel space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="mono-label text-ink-3">
                    {item.kindLabel} · {item.key}
                  </p>
                  <p className={`mono-label ${item.active ? "text-primary" : "text-ink-3"}`}>{item.active ? labels.active : labels.inactive}</p>
                </div>
                <h3 className="font-display text-step-xl">{item.title[locale]}</h3>
                <dl className="grid gap-1 text-step-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
                  <dt className="text-ink-3">{labels.inventory}</dt>
                  <dd className="num-tab">{item.inventory === null ? labels.inventoryUnlimited : item.inventory}</dd>
                  <dt className="text-ink-3">{labels.window}</dt>
                  <dd>{item.windowLabel}</dd>
                  {item.budgetNote ? (
                    <>
                      <dt className="text-ink-3">{labels.budget}</dt>
                      <dd>{item.budgetNote}</dd>
                    </>
                  ) : null}
                </dl>
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const raw = String(new FormData(event.currentTarget).get("inventory") ?? "").trim();
                    const inventory = raw === "" ? null : Number(raw);
                    if (inventory !== null && (!Number.isInteger(inventory) || inventory < 0)) return;
                    void run(`inv-${item.id}`, async () => void (await saveItem(item, { inventory })));
                  }}
                >
                  <div className="space-y-1">
                    <label htmlFor={`inv-${item.id}`} className="mono-label block text-ink-3">
                      {labels.inventory}
                    </label>
                    <input
                      id={`inv-${item.id}`}
                      name="inventory"
                      type="number"
                      min={0}
                      max={10000}
                      defaultValue={item.inventory ?? ""}
                      placeholder={labels.inventoryUnlimited}
                      className="min-h-11 w-32 rounded-sm border border-line-strong bg-background px-3 num-tab focus-ring"
                    />
                  </div>
                  <button type="submit" className="btn btn-ghost btn-sm focus-ring" disabled={busy !== null}>
                    {labels.setInventory}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm focus-ring ${item.active ? "btn-ghost" : "btn-primary"}`}
                    disabled={busy !== null}
                    onClick={() => run(`act-${item.id}`, async () => void (await saveItem(item, { active: !item.active })))}
                  >
                    {item.active ? labels.deactivate : labels.activate}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-claims" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="admin-claims" className="font-display text-step-2xl">
            {labels.claimsHeading}
          </h2>
          <div className="space-y-1">
            <label htmlFor="claim-status" className="mono-label block text-ink-3">
              {labels.filterLabel}
            </label>
            <select
              id="claim-status"
              value={status}
              onChange={(event) => router.push(`/studio/builder-league/rewards${event.target.value ? `?status=${event.target.value}` : ""}`)}
              className="min-h-11 rounded-sm border border-line-strong bg-background px-3 focus-ring"
            >
              <option value="">{labels.allStatuses}</option>
              {statuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {claims.length === 0 ? (
          <p className="text-ink-3">{labels.claimsEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {claims.map((claim) => (
              <li key={claim.id} className="surface-panel space-y-3 p-4">
                <dl className="grid gap-x-4 gap-y-1 text-step-sm sm:grid-cols-4">
                  <div>
                    <dt className="mono-label text-ink-3">{labels.member}</dt>
                    <dd className="break-words">{claim.memberName}</dd>
                  </div>
                  <div>
                    <dt className="mono-label text-ink-3">{labels.reward}</dt>
                    <dd>{claim.rewardTitle}</dd>
                  </div>
                  <div>
                    <dt className="mono-label text-ink-3">{labels.period}</dt>
                    <dd className="font-mono num-tab">{claim.periodKey}</dd>
                  </div>
                  <div>
                    <dt className="mono-label text-ink-3">{labels.requested}</dt>
                    <dd className="num-tab">
                      {claim.createdLabel} · <span className="text-foreground">{claim.statusLabel}</span>
                    </dd>
                  </div>
                </dl>
                {claim.note ? (
                  <p className="text-step-sm text-ink-2">
                    <span className="mono-label text-ink-3">{labels.note}: </span>
                    {claim.note}
                  </p>
                ) : null}
                {claim.actions.length ? (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                      const action = submitter?.value;
                      if (!action) return;
                      const note = String(new FormData(event.currentTarget).get("note") ?? "").trim() || null;
                      void run(`claim-${claim.id}`, async () => void (await post(`/api/v1/builder-admin/rewards/claims/${claim.id}/decision`, { action, note })));
                    }}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <label htmlFor={`note-${claim.id}`} className="sr-only">
                        {labels.note}
                      </label>
                      <input
                        id={`note-${claim.id}`}
                        name="note"
                        maxLength={500}
                        placeholder={labels.note}
                        className="min-h-11 w-full min-w-[10rem] rounded-sm border border-line-strong bg-background px-3 text-step-sm focus-ring"
                      />
                    </div>
                    {claim.actions.map((action) => (
                      <button
                        key={action}
                        type="submit"
                        value={action}
                        className={`btn btn-sm focus-ring ${action === "approve" || action === "redeem" ? "btn-primary" : "btn-ghost"}`}
                        disabled={busy !== null}
                      >
                        {labels.actionLabels[action] ?? action}
                      </button>
                    ))}
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-badges" className="space-y-4">
        <h2 id="admin-badges" className="font-display text-step-2xl">
          {labels.badgesHeading}
        </h2>
        <p className="max-w-[60ch] text-step-sm text-ink-2">{labels.badgesBody}</p>
        {awards.length === 0 ? (
          <p className="text-ink-3">{labels.badgesEmpty}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {awards.map((award) => (
              <li key={award.id} className="flex flex-wrap items-end justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{award.badgeLabel}</p>
                  <p className="text-step-sm text-ink-3">
                    {award.memberName} · {award.awardedLabel}
                  </p>
                </div>
                {award.revokeReason ? (
                  <p className="text-step-sm text-ink-2">
                    {labels.revokedPrefix} {award.revokeReason}
                  </p>
                ) : (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
                      if (reason.length < 3) return;
                      void run(`revoke-${award.id}`, async () => void (await post(`/api/v1/builder-admin/rewards/badges/${award.id}/revoke`, { reason })));
                    }}
                  >
                    <label htmlFor={`reason-${award.id}`} className="sr-only">
                      {labels.revokeReason}
                    </label>
                    <input
                      id={`reason-${award.id}`}
                      name="reason"
                      required
                      minLength={3}
                      maxLength={500}
                      placeholder={labels.revokeReason}
                      className="min-h-11 w-56 max-w-full rounded-sm border border-line-strong bg-background px-3 text-step-sm focus-ring"
                    />
                    <button type="submit" className="btn btn-ghost btn-sm focus-ring" disabled={busy !== null}>
                      {labels.revoke}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
