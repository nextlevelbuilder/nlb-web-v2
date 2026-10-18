import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { users } from "@/lib/db/schema";
import { getEvidenceCopy } from "@/content/builder-league/evidence-copy";
import {
  OPEN_EVIDENCE_STATUSES,
  getEvidenceForViewer,
  latestAppeals,
  projectNames,
  stageNeedsProject,
  toEvidenceDto,
} from "@/lib/builder-league/evidence";
import { BuilderApiError } from "@/lib/builder-league/http";
import { listProjects } from "@/lib/builder-league/projects";
import { getEffectiveRuleset } from "@/lib/builder-league/ruleset";
import { isEventTypeKey } from "@/lib/builder-league/types";
import { param, requireLeagueMember } from "@/components/builder-league/evidence/league-access";
import EvidenceForm, { type EventOption } from "@/components/builder-league/evidence/evidence-form";
import { AppealForm, ConfirmForm, WithdrawForm } from "@/components/builder-league/evidence/evidence-actions";
import { DecisionSummary, eventLabel } from "@/components/builder-league/evidence/evidence-list";
import {
  FormResult,
  LeagueShell,
  MembershipRequired,
  PagePlate,
  StatusBadge,
  formatLeagueDate,
  leagueDateInputValue,
  privateRobots,
  requirementLines,
} from "@/components/builder-league/evidence/evidence-ui";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: getEvidenceCopy(locale).meta.detail, robots: privateRobots };
}

export default async function EvidenceDetailPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  const query = await searchParams;
  const copy = getEvidenceCopy(locale);
  const viewer = await requireLeagueMember(locale, `/builder-league/evidence/${id}`);
  if (!viewer) {
    return (
      <LeagueShell>
        <MembershipRequired copy={copy} />
      </LeagueShell>
    );
  }

  let found;
  try {
    found = await getEvidenceForViewer(viewer.db, id, { id: viewer.user.id, isAdmin: viewer.access.isAdmin });
  } catch (err) {
    if (err instanceof BuilderApiError && err.status === 404) notFound();
    throw err;
  }
  const { evidence, role } = found;
  const appeal = role === "counterparty" ? null : ((await latestAppeals(viewer.db, [evidence.id])).get(evidence.id) ?? null);
  const dto = toEvidenceDto(evidence, role, appeal);
  const people = await viewer.db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, [evidence.userId, ...(evidence.counterpartyUserId ? [evidence.counterpartyUserId] : [])]));
  const nameOf = (userId: string | null) => people.find((person) => person.id === userId)?.name ?? userId ?? "";
  const projectName = evidence.projectId ? ((await projectNames(viewer.db, [evidence.projectId])).get(evidence.projectId) ?? null) : null;
  const definition = isEventTypeKey(evidence.eventType) ? getEffectiveRuleset(evidence.occurredAt).events[evidence.eventType] : undefined;
  const prefix = locale === "vi" ? "/vi" : "";
  const returnTo = `${prefix}/builder-league/evidence/${evidence.id}`;
  const isOpen = (OPEN_EVIDENCE_STATUSES as readonly string[]).includes(evidence.status);
  const appealUsed = Boolean(appeal && evidence.decidedAt && appeal.createdAt.getTime() >= evidence.decidedAt.getTime());
  const canEdit = role === "owner" && isOpen && definition;
  const editEvents: EventOption[] = definition
    ? [
        {
          key: definition.key,
          stage: definition.stage,
          rp: definition.rp,
          requirements: requirementLines(copy, definition),
          minSummary: definition.evidence.minSummaryLength,
          counterparty: definition.evidence.counterpartyConfirmation,
          needsProject: stageNeedsProject(definition.stage),
        },
      ]
    : [];
  const projects = canEdit ? await listProjects(viewer.db, viewer.user.id) : [];

  return (
    <LeagueShell>
      <Link href="/builder-league/evidence" className="inline-flex items-center gap-1.5 text-step-sm text-ink-2 hover:text-foreground">
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
        {copy.detail.back}
      </Link>
      <PagePlate numeral="III" name={copy.plate.detail} coord={copy.stages[evidence.stage]} />
      <header className="space-y-3">
        <p className="eyebrow">{eventLabel(copy, evidence.eventType)}</p>
        <h1 className="break-words font-display text-step-3xl font-light">{evidence.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge copy={copy} status={evidence.status} />
          {role !== "counterparty" ? <p className="text-step-sm text-ink-2">{copy.statusHints[evidence.status]}</p> : null}
        </div>
      </header>
      <FormResult copy={copy} notice={param(query.notice)} error={param(query.error)} />

      {role === "counterparty" && !evidence.counterpartyConfirmedAt && isOpen ? (
        <ConfirmForm copy={copy} evidenceId={evidence.id} helperName={nameOf(evidence.userId)} returnTo={returnTo} />
      ) : null}

      <section aria-label={copy.meta.detail} className="surface-panel space-y-6 p-6 sm:p-8">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="mono-label text-ink-3">{copy.detail.occurred}</dt>
            <dd className="mt-1 text-step-sm">{formatLeagueDate(locale, evidence.occurredAt)}</dd>
          </div>
          <div>
            <dt className="mono-label text-ink-3">{copy.detail.submittedAt}</dt>
            <dd className="mt-1 text-step-sm">{formatLeagueDate(locale, evidence.createdAt, true)}</dd>
          </div>
          {projectName ? (
            <div>
              <dt className="mono-label text-ink-3">{copy.detail.project}</dt>
              <dd className="mt-1 break-words text-step-sm">{projectName}</dd>
            </div>
          ) : null}
          {role !== "counterparty" ? (
            <div>
              <dt className="mono-label text-ink-3">{copy.detail.source}</dt>
              <dd className="mt-1 text-step-sm">{copy.detail.sources[evidence.source] ?? evidence.source}</dd>
            </div>
          ) : null}
          {evidence.counterpartyUserId ? (
            <div>
              <dt className="mono-label text-ink-3">{copy.detail.counterparty}</dt>
              <dd className="mt-1 text-step-sm">
                {nameOf(evidence.counterpartyUserId)}
                <span className="ml-2 text-step-xs text-ink-2">
                  {evidence.counterpartyConfirmedAt ? copy.detail.confirmed : copy.detail.awaitingConfirmation}
                </span>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="mono-label text-ink-3">{copy.form.visibilityLabel}</dt>
            <dd className="mt-1 text-step-sm">{copy.visibility[evidence.visibility].label}</dd>
          </div>
        </dl>

        {evidence.summary ? <p className="whitespace-pre-line break-words border-t border-line pt-6 text-step-base">{evidence.summary}</p> : null}

        {dto.links.length > 0 ? (
          <div className="border-t border-line pt-6">
            <h2 className="mono-label text-ink-3">{copy.detail.links}</h2>
            <ul className="mt-2 space-y-1.5">
              {dto.links.map((link) => (
                <li key={link} className="min-w-0">
                  <a href={link} rel="noopener noreferrer nofollow" target="_blank" className="inline-flex max-w-full items-center gap-1.5 break-all text-step-sm text-primary underline-offset-4 hover:underline">
                    <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {role !== "counterparty" ? (
          <div className="border-t border-line pt-6">
            <h2 className="mono-label text-ink-3">{copy.detail.files}</h2>
            {dto.files.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {dto.files.map((file) => (
                  <li key={file.name}>
                    <a href={file.url} className="inline-flex items-center gap-1.5 break-all text-step-sm text-primary underline-offset-4 hover:underline">
                      <FileText aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      {file.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-step-sm text-ink-2">{copy.detail.noFiles}</p>
            )}
          </div>
        ) : null}

        {role !== "counterparty" && dto.decision ? (
          <div className="border-t border-line pt-6">
            <h2 className="mono-label text-ink-3">{copy.detail.decision}</h2>
            <div className="mt-2">
              <DecisionSummary copy={copy} decision={dto.decision} />
            </div>
          </div>
        ) : null}

        {appeal ? (
          <div className="border-t border-line pt-6">
            <p className="text-step-sm font-medium">{copy.appeal.statuses[appeal.status] ?? appeal.status}</p>
            {appeal.resolution ? <p className="mt-1 whitespace-pre-line text-step-sm text-ink-2">{appeal.resolution}</p> : null}
          </div>
        ) : null}
      </section>

      {role === "owner" && evidence.status === "rejected" && !appealUsed ? <AppealForm copy={copy} evidenceId={evidence.id} returnTo={returnTo} /> : null}

      {canEdit ? (
        <section aria-labelledby="edit-title" className="surface-panel space-y-6 p-6 sm:p-8">
          <h2 id="edit-title" className="h-section">
            {copy.detail.edit}
          </h2>
          <EvidenceForm
            locale={locale}
            mode="edit"
            action={`/api/v1/builder-evidence/${evidence.id}`}
            returnTo={returnTo}
            events={editEvents}
            projects={projects.map((project) => ({ id: project.id, name: project.name }))}
            initial={{
              eventType: evidence.eventType,
              projectId: evidence.projectId,
              occurredAt: leagueDateInputValue(evidence.occurredAt),
              title: evidence.title,
              summary: evidence.summary,
              links: evidence.links,
              counterparty: evidence.counterpartyUserId,
              visibility: evidence.visibility,
            }}
            maxDate={leagueDateInputValue(new Date())}
            existingFiles={dto.files}
          />
          <div className="border-t border-line pt-6">
            <WithdrawForm copy={copy} evidenceId={evidence.id} returnTo={returnTo} />
          </div>
        </section>
      ) : null}
    </LeagueShell>
  );
}
