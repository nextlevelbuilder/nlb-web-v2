import type { Metadata } from "next";
import type { z } from "zod";
import { and, inArray, isNotNull } from "drizzle-orm";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { scoreLedger } from "@/lib/db/schema";
import { getEvidenceCopy } from "@/content/builder-league/evidence-copy";
import { toEvidenceDto } from "@/lib/builder-league/evidence";
import { listModerationQueue, listPilotMembers, QueueQuerySchema } from "@/lib/builder-league/moderation";
import { listOpenAppeals } from "@/lib/builder-league/appeals";
import { cursorParam, param, requireLeagueAdmin } from "@/components/builder-league/evidence/league-access";
import { eventLabel } from "@/components/builder-league/evidence/evidence-list";
import { FormResult, LeagueShell, PageHeader, PagePlate, StatusBadge, formatLeagueDate, privateRobots } from "@/components/builder-league/evidence/evidence-ui";
import { AppealResolutionForm, DecisionForms, PilotPanel, QueueFilters, ReverseForm } from "@/components/builder-league/moderation/moderation-forms";

export const dynamic = "force-dynamic";

type QueueFilterQuery = Partial<z.infer<typeof QueueQuerySchema>> & Pick<z.infer<typeof QueueQuerySchema>, "status">;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: getEvidenceCopy(locale).meta.moderation, robots: privateRobots };
}

export default async function ModerationPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  const copy = getEvidenceCopy(locale);
  const viewer = await requireLeagueAdmin();
  const { db } = viewer;

  const parsed = QueueQuerySchema.safeParse({
    status: param(query.status) || undefined,
    stage: param(query.stage) || undefined,
    eventType: param(query.eventType) || undefined,
    olderThanHours: param(query.olderThanHours) || undefined,
  });
  // Invalid filters fall back to the default queue instead of failing the page.
  const filters: QueueFilterQuery = parsed.success ? parsed.data : { status: "submitted" };
  const status = filters.status;
  const queue = await listModerationQueue(db, { ...filters, limit: 20, cursor: cursorParam(query.cursor) });
  const [appeals, pilots] = await Promise.all([listOpenAppeals(db, 50), listPilotMembers(db)]);

  // Award entries of approved evidence, so an admin can reverse them from the queue.
  const eventIds = queue.items.map((item) => item.evidence.eventId).filter((id): id is string => Boolean(id));
  const entries = eventIds.length > 0 ? await db.select().from(scoreLedger).where(inArray(scoreLedger.eventId, eventIds)) : [];
  const reversed = new Set(
    entries.length > 0
      ? (
          await db
            .select({ id: scoreLedger.reversesEntryId })
            .from(scoreLedger)
            .where(and(isNotNull(scoreLedger.reversesEntryId), inArray(scoreLedger.reversesEntryId, entries.map((entry) => entry.id))))
        ).map((row) => row.id)
      : []
  );

  const prefix = locale === "vi" ? "/vi" : "";
  const filterQuery = new URLSearchParams(
    Object.entries({ status: filters.status, stage: filters.stage, eventType: filters.eventType, olderThanHours: filters.olderThanHours?.toString() }).filter(
      (entry): entry is [string, string] => Boolean(entry[1])
    )
  ).toString();
  const returnTo = `${prefix}/studio/builder-league/moderation${filterQuery ? `?${filterQuery}` : ""}`;
  const formatDate = (value: Date) => formatLeagueDate(locale, value, true);

  return (
    <LeagueShell wide>
      <PagePlate numeral="II" name={copy.plate.moderation} coord={copy.statuses[status]} />
      <PageHeader
        eyebrow={copy.moderation.eyebrow}
        title={copy.moderation.title}
        lede={copy.moderation.lede}
        action={
          <Button asChild variant="outline">
            <Link href="/studio/builder-league">{copy.meta.hub}</Link>
          </Button>
        }
      />
      <FormResult copy={copy} notice={param(query.notice)} error={param(query.error)} />
      <QueueFilters copy={copy} values={{ status, stage: filters.stage, eventType: filters.eventType, olderThanHours: filters.olderThanHours }} action={`${prefix}/studio/builder-league/moderation`} />

      {queue.items.length === 0 ? (
        <p className="surface-panel px-6 py-12 text-center text-step-sm text-ink-2">{copy.moderation.empty}</p>
      ) : (
        <ol className="space-y-6">
          {queue.items.map((item) => {
            const evidence = toEvidenceDto(item.evidence, "admin");
            const own = item.evidence.userId === viewer.user.id;
            const award = entries.find((entry) => entry.eventId === item.evidence.eventId && !entry.reversesEntryId);
            return (
              <li key={evidence.id} className="surface-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                <article className="min-w-0 space-y-4" aria-labelledby={`queue-${evidence.id}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="mono-label text-ink-3">
                      {copy.stages[item.evidence.stage]} · {eventLabel(copy, item.evidence.eventType)}
                    </p>
                    <StatusBadge copy={copy} status={item.evidence.status} />
                  </div>
                  <h2 id={`queue-${evidence.id}`} className="break-words text-step-lg font-medium">
                    <Link href={`/builder-league/evidence/${evidence.id}`} className="hover:text-primary hover:underline hover:underline-offset-4">
                      {evidence.title}
                    </Link>
                  </h2>
                  <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-step-xs text-ink-3">
                    <div className="flex gap-1.5">
                      <dt className="sr-only">{copy.detail.submittedAt}</dt>
                      <dd className="text-ink-2">{copy.moderation.submittedBy(item.submitterName)}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>{copy.moderation.waiting}</dt>
                      <dd className="text-ink-2">{formatDate(item.evidence.createdAt)}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>{copy.detail.occurred}</dt>
                      <dd className="text-ink-2">{formatLeagueDate(locale, item.evidence.occurredAt)}</dd>
                    </div>
                    {item.projectName ? (
                      <div className="flex min-w-0 gap-1.5">
                        <dt>{copy.detail.project}</dt>
                        <dd className="truncate text-ink-2">{item.projectName}</dd>
                      </div>
                    ) : null}
                    {item.rp !== null ? (
                      <div className="flex gap-1.5">
                        <dt>{copy.moderation.rp}</dt>
                        <dd className="text-primary">
                          {item.rp} · {copy.rulesetLabel(item.rulesetVersion)}
                        </dd>
                      </div>
                    ) : null}
                    {item.requiredVerification ? (
                      <div className="flex gap-1.5">
                        <dt>{copy.moderation.required}</dt>
                        <dd className="text-ink-2">{copy.verification[item.requiredVerification]}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {evidence.summary ? <p className="whitespace-pre-line break-words text-step-sm">{evidence.summary}</p> : null}
                  {evidence.links.length > 0 || evidence.files.length > 0 ? (
                    <ul className="space-y-1">
                      {evidence.links.map((link) => (
                        <li key={link}>
                          <a href={link} rel="noopener noreferrer nofollow" target="_blank" className="inline-flex max-w-full items-center gap-1.5 break-all text-step-sm text-primary underline-offset-4 hover:underline">
                            <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
                            {link}
                          </a>
                        </li>
                      ))}
                      {evidence.files.map((file) => (
                        <li key={file.name}>
                          <a href={file.url} className="inline-flex items-center gap-1.5 break-all text-step-sm text-primary underline-offset-4 hover:underline">
                            <FileText aria-hidden className="h-3.5 w-3.5 shrink-0" />
                            {file.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
                <div className="space-y-3">
                  {own ? (
                    <p className="text-step-sm text-ink-2">{copy.moderation.ownEvidence}</p>
                  ) : item.evidence.status === "submitted" || item.evidence.status === "needs_info" ? (
                    <>
                      {item.awaitingCounterparty ? <p className="text-step-xs text-warning">{copy.moderation.awaitingCounterparty}</p> : null}
                      <DecisionForms copy={copy} evidenceId={evidence.id} returnTo={returnTo} canApprove={!item.awaitingCounterparty} />
                    </>
                  ) : award && !reversed.has(award.id) ? (
                    <ReverseForm copy={copy} entryId={award.id} returnTo={returnTo} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {queue.nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/studio/builder-league/moderation?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(filterQuery)), cursor: queue.nextCursor }).toString()}`}>
              {copy.list.more}
            </Link>
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="appeals-title" className="space-y-4">
        <h2 id="appeals-title" className="h-section">
          {copy.moderation.appealsTitle}
        </h2>
        {appeals.length === 0 ? (
          <p className="surface-panel px-6 py-8 text-step-sm text-ink-2">{copy.moderation.appealsEmpty}</p>
        ) : (
          <ul className="space-y-4">
            {appeals.map(({ appeal, evidence, appellantName }) => (
              <li key={appeal.id} className="surface-panel grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                <div className="min-w-0 space-y-2">
                  <p className="mono-label text-ink-3">{copy.moderation.appealBy(appellantName)}</p>
                  <h3 className="break-words text-step-base font-medium">
                    <Link href={`/builder-league/evidence/${evidence.id}`} className="hover:text-primary hover:underline hover:underline-offset-4">
                      {evidence.title}
                    </Link>
                  </h3>
                  <p className="whitespace-pre-line break-words text-step-sm">{appeal.reason}</p>
                </div>
                {appeal.userId === viewer.user.id ? (
                  <p className="text-step-sm text-ink-2">{copy.moderation.ownEvidence}</p>
                ) : (
                  <AppealResolutionForm copy={copy} evidenceId={evidence.id} appealId={appeal.id} returnTo={returnTo} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <PilotPanel copy={copy} rows={pilots} returnTo={returnTo} formatDate={(value) => formatLeagueDate(locale, value)} />
    </LeagueShell>
  );
}
