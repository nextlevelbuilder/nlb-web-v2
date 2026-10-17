import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { evidenceErrorMessage, type EvidenceCopy } from "@/content/builder-league/evidence-copy";
import type { EventDefinition } from "@/lib/builder-league/ruleset";
import type { EvidenceStatus } from "@/lib/builder-league/types";

export const fieldClass =
  "w-full rounded-sm border border-input bg-background px-3 py-2.5 text-step-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const labelClass = "block text-step-sm font-medium text-foreground";
export const hintClass = "mt-1 text-step-xs text-ink-2";

/** Chapter plate: roman numeral, name, hairline and a mono caption. */
export function PagePlate({ numeral, name, coord }: { numeral: string; name: string; coord: string }) {
  return (
    <div className="plate mono" aria-hidden="true">
      <span className="rn">{numeral}</span>
      <span>{name}</span>
      <span className="rule" />
      <span className="coord">{coord}</span>
    </div>
  );
}

/** Page header with eyebrow, display headline and lede; `action` is the one primary action. */
export function PageHeader({ eyebrow, title, lede, action }: { eyebrow: string; title: string; lede?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-3">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display text-step-3xl font-light">{title}</h1>
        {lede ? <p className="lede max-w-[60ch]">{lede}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

const DYNAMIC_NOTICES: [RegExp, (copy: EvidenceCopy, count: number) => string][] = [
  [/^backfill_dry_run_(\d+)$/, (copy, count) => copy.hub.backfillDryRunNotice(count)],
  [/^backfill_done_(\d+)$/, (copy, count) => copy.hub.backfillDoneNotice(count)],
];

export function noticeMessage(copy: EvidenceCopy, notice: string): string | null {
  if (copy.notices[notice]) return copy.notices[notice];
  for (const [pattern, format] of DYNAMIC_NOTICES) {
    const match = pattern.exec(notice);
    if (match) return format(copy, Number(match[1]));
  }
  return null;
}

/** Result of the last form post (`?notice=` / `?error=`), announced to assistive technology. */
export function FormResult({ copy, notice, error }: { copy: EvidenceCopy; notice?: string; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-sm border border-destructive/60 bg-destructive/10 px-4 py-3 text-step-sm text-foreground">
        <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        {evidenceErrorMessage(copy, error)}
      </p>
    );
  }
  const message = notice ? noticeMessage(copy, notice) : null;
  if (!message) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-sm border border-success/50 bg-success/10 px-4 py-3 text-step-sm text-foreground">
      <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      {message}
    </p>
  );
}

const STATUS_TONE: Record<EvidenceStatus, string> = {
  submitted: "border-warning/60 text-warning",
  needs_info: "border-warning/60 text-warning",
  approved: "border-success/60 text-success",
  rejected: "border-destructive/60 text-destructive",
  withdrawn: "border-line-strong text-ink-2",
};

export function StatusBadge({ copy, status }: { copy: EvidenceCopy; status: EvidenceStatus }) {
  return (
    <Badge variant="outline" className={STATUS_TONE[status]}>
      {copy.statuses[status]}
    </Badge>
  );
}

/** Human-readable requirements of an event definition: RP, verification, proof and caps. */
export function requirementLines(copy: EvidenceCopy, definition: EventDefinition): string[] {
  const lines = [copy.verification[definition.requiredVerification]];
  if (definition.evidence.minSummaryLength > 0) lines.push(copy.minSummary(definition.evidence.minSummaryLength));
  lines.push(definition.evidence.linkRequired ? copy.linkRequired : copy.linkOptional);
  if (definition.evidence.counterpartyConfirmation) lines.push(copy.counterpartyRequired);
  if (definition.caps.length > 0) lines.push(`${copy.form.caps}: ${definition.caps.map((cap) => copy.describeCap(cap)).join(" · ")}`);
  return lines;
}

/** Shown when the league is public but the viewer has no paid membership. */
export function MembershipRequired({ copy }: { copy: EvidenceCopy }) {
  return (
    <section aria-labelledby="league-membership" className="surface-panel mx-auto max-w-md space-y-5 p-8 text-center">
      <span aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-sm border border-line text-primary">
        <Lock className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <h1 id="league-membership" className="font-display text-step-2xl font-light">
        {copy.membership.title}
      </h1>
      <p className="text-step-sm text-ink-2">{copy.membership.body}</p>
      <Button asChild size="lg" className="w-full">
        <Link href="/#pricing">{copy.membership.action}</Link>
      </Button>
    </section>
  );
}

/** Formats an instant as a date in the league's time zone. */
export function formatLeagueDate(locale: string, value: Date | string, withTime = false): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "Asia/Saigon",
  }).format(typeof value === "string" ? new Date(value) : value);
}

/** `YYYY-MM-DD` of an instant in Asia/Saigon, for date inputs. */
export function leagueDateInputValue(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

/** Inner-page frame shared by the evidence and admin pages. */
export function LeagueShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className={`wrap ${wide ? "max-w-6xl" : "max-w-4xl"} space-y-10 pb-section-sm pt-[calc(var(--header-h)+3rem)] md:pt-[calc(var(--header-h)+4.5rem)]`}>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Private pages: never indexed. */
export const privateRobots = { index: false, follow: false } as const;
