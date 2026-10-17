import type { Metadata } from "next";
import { FileCheck2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getEvidenceCopy } from "@/content/builder-league/evidence-copy";
import { latestAppeals, listConfirmationRequests, listOwnEvidence, parseDecisionReason, projectNames } from "@/lib/builder-league/evidence";
import { EVIDENCE_STATUSES } from "@/lib/builder-league/types";
import { cursorParam, param, requireLeagueMember, statusParam } from "@/components/builder-league/evidence/league-access";
import { EvidenceList, eventLabel } from "@/components/builder-league/evidence/evidence-list";
import { FormResult, LeagueShell, MembershipRequired, PageHeader, PagePlate, privateRobots } from "@/components/builder-league/evidence/evidence-ui";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: getEvidenceCopy(locale).meta.list, robots: privateRobots };
}

export default async function EvidenceListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  const copy = getEvidenceCopy(locale);
  const viewer = await requireLeagueMember(locale, "/builder-league/evidence");
  if (!viewer) {
    return (
      <LeagueShell>
        <MembershipRequired copy={copy} />
      </LeagueShell>
    );
  }

  const status = statusParam(query.status);
  const { items, nextCursor } = await listOwnEvidence(viewer.db, viewer.user.id, { status, limit: 20, cursor: cursorParam(query.cursor) });
  const [appeals, names, requests] = await Promise.all([
    latestAppeals(viewer.db, items.map((item) => item.id)),
    projectNames(viewer.db, items.map((item) => item.projectId)),
    listConfirmationRequests(viewer.db, viewer.user.id),
  ]);
  const filters = [{ value: undefined, label: copy.list.filterAll }, ...EVIDENCE_STATUSES.map((value) => ({ value, label: copy.statuses[value] }))];

  return (
    <LeagueShell>
      <PagePlate numeral="I" name={copy.plate.evidence} coord="RA 04h 35m · Dec +16°" />
      <PageHeader
        eyebrow={copy.list.eyebrow}
        title={copy.list.title}
        lede={copy.list.lede}
        action={
          <Button asChild size="lg" className="gap-2">
            <Link href="/builder-league/evidence/new">
              <Plus aria-hidden className="h-4 w-4" />
              {copy.list.newAction}
            </Link>
          </Button>
        }
      />
      <FormResult copy={copy} notice={param(query.notice)} error={param(query.error)} />

      {requests.length > 0 ? (
        <section aria-labelledby="confirm-requests" className="surface-panel space-y-4 p-6">
          <div>
            <h2 id="confirm-requests" className="h-section">
              {copy.list.confirmTitle}
            </h2>
            <p className="mt-1 text-step-sm text-ink-2">{copy.list.confirmLede}</p>
          </div>
          <ul className="divide-y divide-line">
            {requests.map(({ evidence, helperName }) => (
              <li key={evidence.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="mono-label text-ink-3">{copy.list.confirmFrom(helperName)}</p>
                  <p className="break-words text-step-sm font-medium">{evidence.title}</p>
                  <p className="text-step-xs text-ink-2">{eventLabel(copy, evidence.eventType)}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/builder-league/evidence/${evidence.id}`}>{copy.list.review}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label={copy.list.filterLabel} className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = filter.value === status;
          return (
            <Link
              key={filter.label}
              href={filter.value ? { pathname: "/builder-league/evidence", query: { status: filter.value } } : "/builder-league/evidence"}
              aria-current={active ? "page" : undefined}
              className={`rounded-sm border px-3 py-1.5 text-step-xs transition-colors ${active ? "border-primary text-primary" : "border-line text-ink-2 hover:border-line-strong hover:text-foreground"}`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <div className="surface-panel px-6 py-14 text-center">
          <FileCheck2 aria-hidden className="mx-auto mb-4 h-10 w-10 text-ink-3" strokeWidth={1.25} />
          <h2 className="font-display text-step-xl font-normal">{copy.list.empty}</h2>
          <p className="mt-2 text-step-sm text-ink-2">{copy.list.emptyHint}</p>
        </div>
      ) : (
        <EvidenceList
          copy={copy}
          locale={locale}
          items={items.map((item) => {
            const decision = parseDecisionReason(item.decisionReason);
            return {
              id: item.id,
              eventType: item.eventType,
              title: item.title,
              status: item.status,
              occurredAt: item.occurredAt.toISOString(),
              projectName: item.projectId ? (names.get(item.projectId) ?? null) : null,
              decision: decision ? { reasonCodes: decision.codes, note: decision.note } : null,
              appealStatus: appeals.get(item.id)?.status ?? null,
            };
          })}
        />
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={{ pathname: "/builder-league/evidence", query: { ...(status ? { status } : {}), cursor: nextCursor } }}>{copy.list.more}</Link>
          </Button>
        </div>
      ) : null}
    </LeagueShell>
  );
}
