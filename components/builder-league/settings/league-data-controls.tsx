import { AlertTriangle, Check, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/builder-league/evidence/evidence-ui";
import type { HomeCopy } from "@/content/builder-league/home-copy";
import { SELF_DELETE_CONFIRMATION } from "@/lib/builder-league/privacy-requests";
import type { SelfDeleteError } from "./self-delete-form-handler";

interface LeagueDataControlsProps {
  copy: HomeCopy["settings"]["data"];
  locale: string;
  isAdmin: boolean;
  /** True for a pilot member while the flag is off: deleting removes the pilot place and with it access. */
  pilotLosesAccess: boolean;
  /** Server action that deletes the signed-in member's data from the posted form. */
  deleteAction: (formData: FormData) => Promise<void>;
  deleted: boolean;
  error: SelfDeleteError | null;
}

/**
 * "Export my data" and "Delete my Builder League data" on the settings page. Both work without
 * JavaScript: the export is a plain link to the JSON download, the delete is a plain form posting to a
 * server action, and the typed confirmation is checked on the server.
 */
export function LeagueDataControls({ copy, locale, isAdmin, pilotLosesAccess, deleteAction, deleted, error }: LeagueDataControlsProps) {
  const errorId = "league-data-delete-error";
  return (
    <section id="league-data" aria-labelledby="league-data-title" className="space-y-6">
      <div className="space-y-2">
        <h2 id="league-data-title" className="font-display text-step-2xl font-light">
          {copy.title}
        </h2>
        <p className="max-w-[60ch] text-ink-2">{copy.lede}</p>
      </div>

      {deleted && (
        <p role="status" className="flex items-center gap-1.5 text-step-sm text-ink-2">
          <Check aria-hidden className="h-4 w-4 text-success" />
          {copy.deleted}
        </p>
      )}

      <div className="surface-panel divide-y divide-line">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[48ch] text-step-sm text-ink-2">{copy.exportDesc}</p>
          <a href="/api/v1/builder-me/export" download className={buttonVariants({ variant: "outline", className: "shrink-0" })}>
            <Download aria-hidden />
            {copy.exportLabel}
          </a>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <h3 className="font-medium">{copy.deleteTitle}</h3>
            <p className="text-step-sm text-ink-2">{copy.deleteDesc}</p>
            <p className="text-step-sm text-ink-2">{copy.deleteKeeps}</p>
            {pilotLosesAccess && !isAdmin && (
              <p className="flex items-start gap-1.5 text-step-sm text-foreground">
                <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                {copy.pilotNote}
              </p>
            )}
          </div>
          {isAdmin ? (
            <p className="text-step-sm text-ink-2">{copy.adminNote}</p>
          ) : (
            <form action={deleteAction} className="space-y-4">
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-2">
                <label htmlFor="league-data-confirm" className={labelClass}>
                  {copy.confirmLabel(SELF_DELETE_CONFIRMATION)}
                </label>
                <input
                  id="league-data-confirm"
                  name="confirm"
                  type="text"
                  required
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  pattern={SELF_DELETE_CONFIRMATION}
                  aria-invalid={error === "confirm" ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  className={`${fieldClass} max-w-xs font-mono`}
                />
              </div>
              {error && (
                <p id={errorId} role="alert" className="flex items-center gap-1.5 text-step-sm text-destructive">
                  <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
                  {copy.errors[error]}
                </p>
              )}
              <Button type="submit" variant="destructive">
                {copy.deleteCta}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
