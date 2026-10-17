import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getBadgesCopy } from "@/content/builder-league/badges-copy";
import { getRewardsCopy } from "@/content/builder-league/rewards-copy";
import { getBadge, listRecentBadgeAwards } from "@/lib/builder-league/badges";
import {
  REWARD_CLAIM_STATUSES,
  listClaimsForAdmin,
  listRewardItems,
  type ClaimAction,
  type RewardClaimStatus,
} from "@/lib/builder-league/rewards";
import { formatLeagueDate } from "@/components/builder-league/badges/progression-page";
import { RewardsAdminClient } from "@/components/builder-league/rewards/rewards-admin-client";

export const dynamic = "force-dynamic";

/** Actions an admin can take from each claim status (mirrors the transitions in `decideClaim`). */
const ACTIONS_BY_STATUS: Partial<Record<RewardClaimStatus, ClaimAction[]>> = {
  requested: ["approve", "reject", "cancel"],
  approved: ["redeem", "expire", "cancel"],
};

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { admin } = getRewardsCopy((await params).locale);
  return { title: admin.metaTitle, robots: { index: false, follow: false } };
}

export default async function RewardsAdminPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const lang = locale === "vi" ? "vi" : "en";
  const copy = getRewardsCopy(locale);
  const badgesCopy = getBadgesCopy(locale);

  let role: string | null | undefined = null;
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    role = (session?.user as { role?: string | null } | undefined)?.role;
  } catch (err) {
    console.warn("rewards admin: session lookup failed (non-fatal)", err);
  }
  if (role !== "admin") notFound();

  const requested = (await searchParams).status ?? "";
  const status = (REWARD_CLAIM_STATUSES as readonly string[]).includes(requested) ? (requested as RewardClaimStatus) : undefined;
  const db = getDb();
  const [items, claims, awards] = await Promise.all([listRewardItems(db), listClaimsForAdmin(db, { status }), listRecentBadgeAwards(db)]);
  const date = (value: Date | null) => (value ? formatLeagueDate(value, locale) : "…");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-5xl space-y-8 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <header className="space-y-5">
            <p className="eyebrow">{copy.admin.eyebrow}</p>
            <h1 className="font-display text-step-3xl font-light text-balance">{copy.admin.title}</h1>
            <p className="lede max-w-[60ch]">{copy.admin.lede}</p>
          </header>
          <RewardsAdminClient
            locale={lang}
            status={status ?? ""}
            statuses={REWARD_CLAIM_STATUSES.map((value) => ({ value, label: copy.claimStatus[value] }))}
            items={items.map((item) => ({
              id: item.id,
              key: item.key,
              kind: item.kind,
              kindLabel: copy.kinds[item.kind as keyof typeof copy.kinds] ?? item.kind,
              title: item.title,
              description: item.description,
              eligibility: item.eligibility,
              inventory: item.inventory,
              budgetNote: item.budgetNote,
              availableFrom: item.availableFrom ? item.availableFrom.toISOString() : null,
              availableUntil: item.availableUntil ? item.availableUntil.toISOString() : null,
              windowLabel: item.availableFrom || item.availableUntil ? `${date(item.availableFrom)} – ${date(item.availableUntil)}` : copy.admin.always,
              active: item.active,
            }))}
            claims={claims.map(({ claim, memberName, rewardTitle }) => ({
              id: claim.id,
              memberName,
              rewardTitle: rewardTitle[lang],
              periodKey: claim.periodKey,
              status: claim.status,
              statusLabel: copy.claimStatus[claim.status],
              note: claim.note,
              createdLabel: formatLeagueDate(claim.createdAt, locale),
              actions: ACTIONS_BY_STATUS[claim.status] ?? [],
            }))}
            awards={awards.map(({ award, memberName }) => {
              const badge = getBadge(award.badgeKey);
              const name = badge ? (award.seasonKey && badge.seasonal ? badge.seasonal.name[lang] : badge.name[lang]) : award.badgeKey;
              return {
                id: award.id,
                memberName,
                badgeLabel: `${badge ? `${badgesCopy.page.plateLabel(badge.numeral)} · ` : ""}${name}${award.seasonKey ? ` · ${award.seasonKey}` : ""}`,
                awardedLabel: formatLeagueDate(award.awardedAt, locale),
                revokeReason: award.revokedAt ? award.revokeReason ?? "" : null,
              };
            })}
            labels={{
              seed: copy.admin.seed,
              seeding: copy.admin.seeding,
              seeded: { none: copy.admin.seeded(0), some: copy.admin.seeded("{count}") },
              itemsHeading: copy.admin.itemsHeading,
              itemsEmpty: copy.admin.itemsEmpty,
              active: copy.admin.active,
              inactive: copy.admin.inactive,
              activate: copy.admin.activate,
              deactivate: copy.admin.deactivate,
              inventory: copy.admin.inventory,
              inventoryUnlimited: copy.admin.inventoryUnlimited,
              setInventory: copy.admin.setInventory,
              budget: copy.admin.budget,
              window: copy.admin.window,
              claimsHeading: copy.admin.claimsHeading,
              claimsEmpty: copy.admin.claimsEmpty,
              filterLabel: copy.admin.filterLabel,
              allStatuses: copy.admin.allStatuses,
              member: copy.admin.member,
              reward: copy.admin.reward,
              period: copy.admin.period,
              requested: copy.admin.requested,
              actions: copy.admin.actions,
              note: copy.admin.note,
              actionLabels: copy.admin.actionLabels,
              badgesHeading: copy.admin.badgesHeading,
              badgesBody: copy.admin.badgesBody,
              badgesEmpty: copy.admin.badgesEmpty,
              revoke: copy.admin.revoke,
              revokeReason: copy.admin.revokeReason,
              revokedPrefix: copy.admin.revoked("").trim(),
              working: copy.admin.working,
              done: copy.admin.done,
              error: copy.admin.error,
            }}
          />
        </div>
      </main>
    </div>
  );
}
