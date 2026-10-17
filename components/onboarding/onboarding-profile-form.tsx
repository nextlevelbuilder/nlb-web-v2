'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { OnboardingApiError, saveProfile, type ProfileDraft, type ProfileSummary } from './onboarding-api';

const FIELD_CLASS =
  'w-full rounded-sm border border-line-strong bg-canvas-deep px-3 py-2.5 text-step-base text-foreground placeholder:text-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[invalid=true]:border-destructive';
const ERROR_FIELDS = ['goal', 'commitmentAccepted', 'profileLinks', 'skills', 'phone'] as const;
type ErrorField = (typeof ERROR_FIELDS)[number];

function draftFrom(profile: ProfileSummary): ProfileDraft {
  const links = [...profile.profileLinks];
  while (links.length < 3) links.push('');
  return {
    goal: profile.goal,
    profileLinks: links.slice(0, 3),
    skills: profile.skills,
    phone: profile.phone,
    commitmentAccepted: profile.commitmentAccepted,
  };
}

export interface OnboardingProfileFormProps {
  profile: ProfileSummary;
  onSaved: (profile: ProfileSummary, submitted: boolean) => void;
}

/** Minimal member form: goal and commitment required, links, skills and phone optional; resumable. */
export default function OnboardingProfileForm({ profile, onSaved }: OnboardingProfileFormProps) {
  const t = useTranslations('onboarding.profile');
  const id = useId();
  const [editing, setEditing] = useState(!profile.completed);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(profile));
  const [errors, setErrors] = useState<ErrorField[]>([]);
  const [saving, setSaving] = useState<null | 'save' | 'submit'>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const update = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => current.filter((field) => field !== key));
  };

  const persist = async (submit: boolean) => {
    const missing: ErrorField[] = [];
    if (submit && !draft.goal.trim()) missing.push('goal');
    if (submit && !draft.commitmentAccepted) missing.push('commitmentAccepted');
    if (missing.length) {
      setErrors(missing);
      setNotice({ tone: 'error', text: t(`errors.${missing[0]}`) });
      return;
    }
    setSaving(submit ? 'submit' : 'save');
    setNotice(null);
    try {
      const saved = await saveProfile({ ...draft, profileLinks: draft.profileLinks.filter((link) => link.trim()) }, submit);
      setErrors([]);
      setNotice({ tone: 'info', text: t(saved.completed && submit ? 'completed' : 'saved') });
      if (submit && saved.completed) setEditing(false);
      onSaved(saved, submit);
    } catch (error) {
      const fields = error instanceof OnboardingApiError && Array.isArray(error.body.fields) ? (error.body.fields as string[]) : [];
      const invalid = ERROR_FIELDS.filter((field) => fields.includes(field));
      setErrors(invalid);
      setNotice({ tone: 'error', text: invalid.length ? t(`errors.${invalid[0]}`) : t('errors.generic') });
    } finally {
      setSaving(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void persist(true);
  };

  const fieldId = (name: string) => `${id}-${name}`;
  const invalid = (field: ErrorField) => errors.includes(field);
  const errorText = (field: ErrorField) =>
    invalid(field) ? (
      <p id={fieldId(`${field}-error`)} className="text-step-xs text-destructive">
        {t(`errors.${field}`)}
      </p>
    ) : null;
  const describedBy = (field: ErrorField, hint?: string) =>
    [hint, invalid(field) ? fieldId(`${field}-error`) : null].filter(Boolean).join(' ') || undefined;

  if (!editing) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-step-sm text-foreground">
          <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-success" />
          {t('completed')}
        </p>
        <p className="line-clamp-3 text-step-sm text-ink-2">{draft.goal}</p>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setEditing(true)}>
          <Pencil aria-hidden />
          {t('edit')}
        </Button>
      </div>
    );
  }

  const commitmentLink = (chunks: ReactNode) => (
    <Link href="/policies/onboarding" target="_blank" rel="noopener" className="text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-primary">
      {chunks}
    </Link>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor={fieldId('goal')} className="block text-step-sm font-medium text-foreground">
          {t('goal')} <span className="text-ink-3">{t('required')}</span>
        </label>
        <p id={fieldId('goal-hint')} className="text-step-xs text-ink-3">{t('goalHint')}</p>
        <textarea
          id={fieldId('goal')}
          value={draft.goal}
          onChange={(event) => update('goal', event.target.value)}
          maxLength={500}
          rows={3}
          required
          aria-invalid={invalid('goal')}
          aria-describedby={describedBy('goal', fieldId('goal-hint'))}
          className={cn(FIELD_CLASS, 'min-h-[6rem] resize-y')}
        />
        {errorText('goal')}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-step-sm font-medium text-foreground">
          {t('links')} <span className="text-ink-3">{t('optional')}</span>
        </legend>
        <p id={fieldId('links-hint')} className="text-step-xs text-ink-3">{t('linksHint')}</p>
        <div className="grid gap-2">
          {draft.profileLinks.map((link, index) => (
            <input
              key={index}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://"
              aria-label={t('linkLabel', { n: index + 1 })}
              value={link}
              maxLength={300}
              onChange={(event) =>
                update('profileLinks', draft.profileLinks.map((value, i) => (i === index ? event.target.value : value)))
              }
              aria-invalid={invalid('profileLinks')}
              aria-describedby={describedBy('profileLinks', fieldId('links-hint'))}
              className={FIELD_CLASS}
            />
          ))}
        </div>
        {errorText('profileLinks')}
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={fieldId('skills')} className="block text-step-sm font-medium text-foreground">
            {t('skills')} <span className="text-ink-3">{t('optional')}</span>
          </label>
          <input
            id={fieldId('skills')}
            value={draft.skills}
            maxLength={200}
            placeholder={t('skillsPlaceholder')}
            onChange={(event) => update('skills', event.target.value)}
            aria-invalid={invalid('skills')}
            aria-describedby={describedBy('skills')}
            className={FIELD_CLASS}
          />
          {errorText('skills')}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={fieldId('phone')} className="block text-step-sm font-medium text-foreground">
            {t('phone')} <span className="text-ink-3">{t('optional')}</span>
          </label>
          <input
            id={fieldId('phone')}
            type="tel"
            autoComplete="tel"
            value={draft.phone}
            maxLength={32}
            onChange={(event) => update('phone', event.target.value)}
            aria-invalid={invalid('phone')}
            aria-describedby={describedBy('phone', fieldId('phone-hint'))}
            className={FIELD_CLASS}
          />
          <p id={fieldId('phone-hint')} className="text-step-xs text-ink-3">{t('phoneHint')}</p>
          {errorText('phone')}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex min-h-[44px] items-start gap-3 text-step-sm text-ink-2">
          <input
            id={fieldId('commitment')}
            type="checkbox"
            checked={draft.commitmentAccepted}
            onChange={(event) => update('commitmentAccepted', event.target.checked)}
            aria-invalid={invalid('commitmentAccepted')}
            aria-describedby={describedBy('commitmentAccepted')}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-[4px] border-line-strong accent-[hsl(var(--primary))]"
          />
          <label htmlFor={fieldId('commitment')} className="cursor-pointer">
            {t.rich('commitment', { link: commitmentLink })}
          </label>
        </div>
        {errorText('commitmentAccepted')}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="outline" onClick={() => void persist(false)} disabled={saving !== null}>
          {saving === 'save' && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
          {saving === 'save' ? t('saving') : t('save')}
        </Button>
        <Button type="submit" disabled={saving !== null}>
          {saving === 'submit' && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
          {saving === 'submit' ? t('saving') : t('submit')}
        </Button>
      </div>

      <p
        role={notice?.tone === 'error' ? 'alert' : 'status'}
        className={cn('text-step-sm', notice?.tone === 'error' ? 'text-destructive' : 'text-ink-2', !notice && 'sr-only')}
      >
        {notice?.text ?? ''}
      </p>
    </form>
  );
}
