import { getRewardsCopy } from "@/content/builder-league/rewards-copy";
import {
  describeRequirement,
  listMemberClaims,
  listRewardItems,
  listRewardsForMember,
  type MemberReward,
  type RequirementResult,
} from "@/lib/builder-league/rewards";
import { ClaimRewardForm } from "@/components/builder-league/rewards/claim-reward-form";
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
  const { page } = getRewardsCopy((await params).locale);
  return progressionMetadata(page.metaTitle, page.metaDescription);
}

export default async function RewardsPage({ params }: PageProps) {
  const { locale } = await params;
  const lang = locale === "vi" ? "vi" : "en";
  const copy = getRewardsCopy(locale);
  const viewer = await loadProgressionViewer();
  const shell = { locale, section: "rewards" as const, eyebrow: copy.page.eyebrow, title: copy.page.title, lede: copy.page.lede, note: copy.page.notCash };
  if (viewer.status !== "ok") return <ProgressionShell {...shell} viewer={viewer} />;

  const [rewards, claims, items] = await Promise.all([
    listRewardsForMember(viewer.db, viewer.userId),
    listMemberClaims(viewer.db, viewer.userId),
    listRewardItems(viewer.db),
  ]);
  const titles = new Map(items.map((item) => [item.id, item.title[lang]]));

  return (
    <ProgressionShell {...shell} viewer={viewer}>
      <section aria-label={copy.page.title} className="space-y-4">
        {rewards.length === 0 ? (
          <p className="text-ink-2">{copy.page.empty}</p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {rewards.map((reward) => (
              <RewardCard key={reward.item.id} reward={reward} locale={locale} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rewards-history" className="space-y-4">
        <h2 id="rewards-history" className="font-display text-step-2xl">
          {copy.page.historyHeading}
        </h2>
        {claims.length === 0 ? (
          <p className="text-ink-3">{copy.page.historyEmpty}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {claims.map((claim) => (
              <li key={claim.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="font-medium">{titles.get(claim.rewardId) ?? claim.rewardId}</span>
                <span className="flex flex-wrap gap-x-3 font-mono text-step-xs uppercase tracking-[0.08em] text-ink-3 num-tab">
                  <span>{claim.periodKey}</span>
                  <span>{formatLeagueDate(claim.createdAt, locale)}</span>
                  <span className="text-foreground">{copy.claimStatus[claim.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ProgressionShell>
  );
}

function RewardCard({ reward, locale }: { reward: MemberReward; locale: string }) {
  const lang = locale === "vi" ? "vi" : "en";
  const copy = getRewardsCopy(locale);
  const { item, availability, eligibility, claim } = reward;
  const canClaim = availability === "open" && eligibility?.eligible && !claim;
  return (
    <li className="surface-panel flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono-label text-ink-3">{copy.kinds[item.kind as keyof typeof copy.kinds] ?? item.kind}</p>
        <p className="mono-label text-ink-2">{copy.availability[availability]}</p>
      </div>
      <h2 className="font-display text-step-xl">{item.title[lang]}</h2>
      <p className="text-step-sm text-ink-2">{item.description[lang]}</p>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-step-xs text-ink-3 num-tab">
        <div>
          <dt className="sr-only">Inventory</dt>
          <dd>{item.inventory === null ? copy.page.unlimited : copy.page.left(item.inventory)}</dd>
        </div>
        {eligibility ? (
          <div>
            <dt className="sr-only">Period</dt>
            <dd>{copy.period[eligibility.period]}</dd>
          </div>
        ) : null}
        {item.availableFrom && availability === "upcoming" ? <dd>{copy.page.opensOn(formatLeagueDate(item.availableFrom, locale))}</dd> : null}
        {item.availableUntil ? <dd>{copy.page.closesOn(formatLeagueDate(item.availableUntil, locale))}</dd> : null}
      </dl>
      {eligibility ? (
        <div className="space-y-3 border-t border-line pt-4">
          <p className={`text-step-sm font-medium ${eligibility.eligible ? "text-primary" : "text-ink-2"}`}>
            {eligibility.eligible ? copy.page.eligible : copy.page.notEligible}
          </p>
          <RequirementList heading={copy.page.requirementsAll} items={eligibility.allOf} lang={lang} met={copy.page.met} notMet={copy.page.notMet} />
          <RequirementList heading={eligibility.allOf.length ? copy.page.requirementsAny : copy.page.requirementsOneOf} items={eligibility.anyOf} lang={lang} met={copy.page.met} notMet={copy.page.notMet} />
        </div>
      ) : null}
      {claim ? (
        <div className="space-y-1 border-t border-line pt-4 text-step-sm">
          <p className="text-foreground">{copy.page.yourClaim(copy.claimStatus[claim.status])}</p>
          {claim.status === "approved" && claim.expiresAt ? <p className="text-ink-3">{copy.page.redeemBy(formatLeagueDate(claim.expiresAt, locale))}</p> : null}
        </div>
      ) : canClaim ? (
        <div className="mt-auto border-t border-line pt-4">
          <ClaimRewardForm
            rewardId={item.id}
            labels={{
              note: copy.page.noteLabel,
              notePlaceholder: copy.page.notePlaceholder,
              claim: copy.page.claim,
              claiming: copy.page.claiming,
              claimed: copy.page.claimed,
            }}
            errors={copy.page.claimError}
          />
        </div>
      ) : null}
    </li>
  );
}

function RequirementList({
  heading,
  items,
  lang,
  met,
  notMet,
}: {
  heading: string;
  items: RequirementResult[];
  lang: "en" | "vi";
  met: string;
  notMet: string;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="mono-label text-ink-3">{heading}</p>
      <ul className="space-y-1 text-step-sm">
        {items.map(({ requirement, met: isMet }, index) => (
          <li key={index} className="flex items-start gap-2">
            <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full border ${isMet ? "border-primary bg-primary" : "border-ink-3"}`} />
            <span className={isMet ? "text-foreground" : "text-ink-2"}>
              {describeRequirement(requirement, lang)} <span className="sr-only">({isMet ? met : notMet})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
