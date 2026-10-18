import { Button } from "@/components/ui/button";
import type { EvidenceCopy } from "@/content/builder-league/evidence-copy";
import { fieldClass, hintClass, labelClass } from "./evidence-ui";

/**
 * Member actions on one evidence entry. Plain HTML forms posting to the API, which answers a form post
 * with a 303 back to `returnTo` carrying `?notice=` or `?error=`; they need no JavaScript.
 */

export function AppealForm({ copy, evidenceId, returnTo }: { copy: EvidenceCopy; evidenceId: string; returnTo: string }) {
  return (
    <section aria-labelledby="appeal-title" className="surface-panel space-y-4 p-6">
      <div>
        <h2 id="appeal-title" className="h-section">
          {copy.appeal.title}
        </h2>
        <p className="mt-1 text-step-sm text-ink-2">{copy.appeal.lede}</p>
      </div>
      <form action={`/api/v1/builder-evidence/${evidenceId}/appeal`} method="post" className="space-y-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div>
          <label htmlFor="appeal-reason" className={labelClass}>
            {copy.appeal.reasonLabel}
          </label>
          <textarea id="appeal-reason" name="reason" required minLength={20} maxLength={2000} rows={4} aria-describedby="appeal-reason-hint" className={`${fieldClass} mt-2`} />
          <p id="appeal-reason-hint" className={hintClass}>
            {copy.appeal.reasonHint}
          </p>
        </div>
        <Button type="submit">{copy.appeal.submit}</Button>
      </form>
    </section>
  );
}

export function WithdrawForm({ copy, evidenceId, returnTo }: { copy: EvidenceCopy; evidenceId: string; returnTo: string }) {
  return (
    <form action={`/api/v1/builder-evidence/${evidenceId}`} method="post" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="action" value="withdraw" />
      <Button type="submit" variant="ghost" size="sm" className="self-start text-destructive hover:text-destructive">
        {copy.detail.withdraw}
      </Button>
      <p className="text-step-xs text-ink-2">{copy.detail.withdrawHint}</p>
    </form>
  );
}

export function ConfirmForm({ copy, evidenceId, helperName, returnTo }: { copy: EvidenceCopy; evidenceId: string; helperName: string; returnTo: string }) {
  return (
    <section aria-labelledby="confirm-title" className="surface-panel space-y-4 p-6">
      <div>
        <h2 id="confirm-title" className="h-section">
          {copy.confirm.title}
        </h2>
        <p className="mt-1 text-step-sm text-ink-2">{copy.confirm.lede(helperName)}</p>
      </div>
      <form action={`/api/v1/builder-evidence/${evidenceId}/confirm`} method="post">
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button type="submit" size="lg">
          {copy.confirm.submit}
        </Button>
      </form>
    </section>
  );
}
