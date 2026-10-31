import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { getPrivacy } from "@/lib/builder-league/privacy";
import { getHomeCopy, type PrivacySwitch } from "@/content/builder-league/home-copy";
import { requireBuilderPageViewer } from "@/components/builder-league/home/page-access";
import { BuilderAccessPanel } from "@/components/builder-league/home/access-panel";
import { LeagueDataControls } from "@/components/builder-league/settings/league-data-controls";
import { isSelfDeleteError } from "@/components/builder-league/settings/self-delete-form-handler";
import { pageMetadata } from "@/lib/seo";
import { deleteMyLeagueData, savePrivacySettings } from "./actions";

export const dynamic = "force-dynamic";

const SWITCHES: PrivacySwitch[] = ["leaderboardPublic", "passportPublic", "peerMentionsOk", "backfillOptIn", "redactFinancials"];

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: SettingsPageProps) {
  const { locale } = await params;
  const copy = getHomeCopy(locale);
  return { ...pageMetadata({ title: copy.settings.metaTitle, description: copy.settings.lede, path: "/builder-league/settings", locale }), robots: { index: false, follow: false } };
}

export default async function BuilderSettingsPage({ params, searchParams }: SettingsPageProps) {
  const { locale } = await params;
  const { saved, deleted, deleteError } = await searchParams;
  const viewer = await requireBuilderPageViewer();
  const copy = getHomeCopy(locale);
  const privacy = viewer.user && viewer.access.canUse ? await getPrivacy(getDb(), viewer.user.id) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap max-w-3xl space-y-10 pb-section-sm pt-[calc(var(--header-h)+3rem)]">
          <header className="space-y-5">
            <Link href="/builder-league" className="inline-flex min-h-[44px] items-center gap-1.5 text-step-sm text-ink-2 hover:text-foreground">
              <ArrowLeft aria-hidden className="h-4 w-4" />
              {copy.settings.back}
            </Link>
            <p className="eyebrow">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-primary" />
              {copy.settings.eyebrow}
            </p>
            <h1 className="font-display text-step-3xl font-light">{copy.settings.title}</h1>
            <p className="lede max-w-[60ch]">{copy.settings.lede}</p>
          </header>

          {privacy ? (
            <>
              <form action={savePrivacySettings} className="space-y-6">
                <input type="hidden" name="locale" value={locale} />
                <fieldset className="surface-panel divide-y divide-line">
                  <legend className="sr-only">{copy.settings.title}</legend>
                  {SWITCHES.map((key) => {
                    const id = `privacy-${key}`;
                    return (
                      <div key={key} className="flex items-start gap-4 p-5">
                        <input
                          id={id}
                          name={key}
                          type="checkbox"
                          defaultChecked={privacy[key]}
                          aria-describedby={`${id}-desc`}
                          className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                        />
                        <div className="min-w-0 space-y-1">
                          <label htmlFor={id} className="block cursor-pointer font-medium">
                            {copy.settings.switches[key].label}
                          </label>
                          <p id={`${id}-desc`} className="text-step-sm text-ink-2">
                            {copy.settings.switches[key].desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </fieldset>
                <div className="flex flex-wrap items-center gap-4">
                  <Button type="submit">{copy.settings.save}</Button>
                  {saved === "1" && (
                    <p role="status" className="flex items-center gap-1.5 text-step-sm text-ink-2">
                      <Check aria-hidden className="h-4 w-4 text-success" />
                      {copy.settings.saved}
                    </p>
                  )}
                </div>
              </form>
              <LeagueDataControls
                copy={copy.settings.data}
                locale={locale}
                isAdmin={viewer.access.isAdmin}
                pilotLosesAccess={viewer.access.isPilot && !viewer.access.flagEnabled}
                deleteAction={deleteMyLeagueData}
                deleted={deleted === "1"}
                error={isSelfDeleteError(deleteError) ? deleteError : null}
              />
            </>
          ) : (
            <BuilderAccessPanel viewer={viewer} locale={locale} path="/builder-league/settings" />
          )}
        </div>
      </main>
    </div>
  );
}
