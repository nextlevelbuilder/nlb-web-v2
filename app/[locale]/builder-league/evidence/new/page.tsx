import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getEvidenceCopy } from "@/content/builder-league/evidence-copy";
import { stageNeedsProject, submittableDefinitions } from "@/lib/builder-league/evidence";
import { listProjects } from "@/lib/builder-league/projects";
import { getEffectiveRuleset } from "@/lib/builder-league/ruleset";
import { STAGES, type Stage } from "@/lib/builder-league/types";
import { param, requireLeagueMember } from "@/components/builder-league/evidence/league-access";
import EvidenceForm, { type EventOption } from "@/components/builder-league/evidence/evidence-form";
import {
  FormResult,
  LeagueShell,
  MembershipRequired,
  PageHeader,
  PagePlate,
  fieldClass,
  hintClass,
  labelClass,
  leagueDateInputValue,
  privateRobots,
  requirementLines,
} from "@/components/builder-league/evidence/evidence-ui";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: getEvidenceCopy(locale).meta.create, robots: privateRobots };
}

export default async function NewEvidencePage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  const copy = getEvidenceCopy(locale);
  const viewer = await requireLeagueMember(locale, "/builder-league/evidence/new");
  if (!viewer) {
    return (
      <LeagueShell>
        <MembershipRequired copy={copy} />
      </LeagueShell>
    );
  }

  const now = new Date();
  const ruleset = getEffectiveRuleset(now);
  const definitions = submittableDefinitions(ruleset);
  const requestedType = param(query.type);
  const prefill = definitions.find((definition) => definition.key === requestedType);
  const requestedStage = param(query.stage);
  const stage = (STAGES as readonly string[]).includes(requestedStage ?? "") ? (requestedStage as Stage) : prefill?.stage;
  const visible = stage ? definitions.filter((definition) => definition.stage === stage) : definitions;
  const events: EventOption[] = visible.map((definition) => ({
    key: definition.key,
    stage: definition.stage,
    rp: definition.rp,
    requirements: requirementLines(copy, definition),
    minSummary: definition.evidence.minSummaryLength,
    counterparty: definition.evidence.counterpartyConfirmation,
    needsProject: stageNeedsProject(definition.stage),
  }));
  const projects = await listProjects(viewer.db, viewer.user.id);
  const prefix = locale === "vi" ? "/vi" : "";
  const pageQuery = new URLSearchParams({ ...(stage ? { stage } : {}), ...(prefill ? { type: prefill.key } : {}) }).toString();
  const returnTo = `${prefix}/builder-league/evidence/new${pageQuery ? `?${pageQuery}` : ""}`;
  const stagesWithEvents = STAGES.filter((key) => definitions.some((definition) => definition.stage === key));

  return (
    <LeagueShell>
      <Link href="/builder-league/evidence" className="inline-flex items-center gap-1.5 text-step-sm text-ink-2 hover:text-foreground">
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
        {copy.detail.back}
      </Link>
      <PagePlate numeral="II" name={copy.plate.create} coord={copy.rulesetLabel(ruleset.version)} />
      <PageHeader eyebrow={copy.form.eyebrow} title={copy.form.title} lede={copy.form.lede} />
      <FormResult copy={copy} notice={param(query.notice)} error={param(query.error)} />

      <nav aria-label={copy.form.stageStep} className="space-y-2">
        <p className="mono-label text-ink-3">{copy.form.stageStep}</p>
        <div className="flex flex-wrap gap-2">
          {[undefined, ...stagesWithEvents].map((key) => {
            const active = key === stage;
            return (
              <Link
                key={key ?? "all"}
                href={key ? { pathname: "/builder-league/evidence/new", query: { stage: key } } : "/builder-league/evidence/new"}
                aria-current={active ? "page" : undefined}
                className={`rounded-sm border px-3 py-1.5 font-mono text-step-xs tracking-wide transition-colors ${active ? "border-primary text-primary" : "border-line text-ink-2 hover:border-line-strong hover:text-foreground"}`}
              >
                {key ? copy.stages[key] : copy.form.stageAll}
              </Link>
            );
          })}
        </div>
      </nav>

      <section aria-label={copy.form.title} className="surface-panel p-6 sm:p-8">
        <EvidenceForm
          locale={locale}
          mode="create"
          action="/api/v1/builder-evidence"
          returnTo={returnTo}
          events={events}
          projects={projects.map((project) => ({ id: project.id, name: project.name }))}
          initial={{ eventType: prefill?.key, occurredAt: leagueDateInputValue(now), visibility: "private" }}
          maxDate={leagueDateInputValue(now)}
          clientKey={crypto.randomUUID()}
        />
      </section>

      <details className="surface-panel group p-6">
        <summary className="cursor-pointer text-step-sm font-medium">{copy.form.projectCreate}</summary>
        <form action="/api/v1/builder-projects" method="post" className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="returnTo" value={returnTo} />
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          <div>
            <label htmlFor="new-project-name" className={labelClass}>
              {copy.form.projectName}
            </label>
            <input id="new-project-name" name="name" required minLength={2} maxLength={80} className={`${fieldClass} mt-2`} />
            <p className={hintClass}>{copy.visibility.private.hint}</p>
          </div>
          <Button type="submit" variant="outline">
            {copy.form.projectAction}
          </Button>
        </form>
      </details>

      <details className="surface-panel p-6">
        <summary className="cursor-pointer text-step-sm font-medium">{copy.form.requirementsAll}</summary>
        <dl className="mt-5 divide-y divide-line">
          {visible.map((definition) => (
            <div key={definition.key} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:gap-6">
              <dt className="text-step-sm font-medium">
                {copy.events[definition.key]}
                <span className="ml-2 font-mono text-step-xs text-primary">{copy.rp(definition.rp)}</span>
              </dt>
              <dd className="text-step-sm text-ink-2">{requirementLines(copy, definition).join(" · ")}</dd>
            </div>
          ))}
        </dl>
      </details>
    </LeagueShell>
  );
}
