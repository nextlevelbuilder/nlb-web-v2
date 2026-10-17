'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { trackOnboardingEvent } from '@/lib/analytics/onboarding-events';
import { cn } from '@/lib/utils';
import CommunityConnectionCard from './community-connection-card';
import OnboardingProfileForm from './onboarding-profile-form';
import { useUnlinkPolling } from './use-unlink-polling';
import { fetchOnboardingStatus, type DiscordErrorCode, type OnboardingStatus } from './onboarding-api';

/** Backoff while Polar confirms a payment: about one minute in total, then the help message. */
const PAYMENT_POLL_DELAYS_MS = [2000, 3000, 4000, 6000, 8000, 10000, 12000, 15000];
const TELEGRAM_POLL_MS = 5000;
const TELEGRAM_POLL_LIMIT = 24;

export interface OnboardingFlowProps {
  checkoutId: string | null;
  discordLinked: boolean;
  discordError: DiscordErrorCode | null;
  supportEmail: string;
}

function Panel({ icon, title, children, tone = 'default' }: { icon: ReactNode; title: string; children: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <section
      aria-live="polite"
      className={cn('surface-panel space-y-4 p-6 text-center sm:p-8', tone === 'warn' && 'border-warning/50')}
    >
      <span aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-sm border border-line text-primary">
        {icon}
      </span>
      <h2 className="font-display text-step-xl font-light">{title}</h2>
      {children}
    </section>
  );
}

function Step({ numeral, label, title, done, children }: { numeral: string; label: string; title: string; done: boolean; children: ReactNode }) {
  return (
    <li className="surface-panel space-y-5 p-5 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="mono-label text-ink-3">
          <span className="text-primary">{numeral}</span> · {label}
        </p>
        {done && <CheckCircle2 aria-hidden className="h-5 w-5 text-success" />}
      </div>
      <h2 className="font-display text-step-xl">{title}</h2>
      {children}
    </li>
  );
}

/** Client side of /onboarding: payment verification, then profile, Discord and Telegram steps. */
export default function OnboardingFlow({ checkoutId, discordLinked, discordError, supportEmail }: OnboardingFlowProps) {
  const t = useTranslations('onboarding');
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [paymentSlow, setPaymentSlow] = useState(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const telegramPolls = useRef(0);
  const telegramWasLinked = useRef<boolean | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const load = useCallback(async () => {
    try {
      const next = await fetchOnboardingStatus(checkoutId);
      setStatus(next);
      setLoadError(false);
      return next;
    } catch {
      setLoadError(true);
      return null;
    }
  }, [checkoutId]);

  // Payment verification polling with backoff.
  const pollPayment = useCallback(async () => {
    const tick = async () => {
      clearTimer();
      const next = await load();
      const waiting = !next || next.payment === 'pending' || next.payment === 'verifying';
      if (!waiting) return;
      if (attempt.current >= PAYMENT_POLL_DELAYS_MS.length) {
        setPaymentSlow(true);
        return;
      }
      timer.current = setTimeout(() => void tick(), PAYMENT_POLL_DELAYS_MS[attempt.current]);
      attempt.current += 1;
    };
    await tick();
  }, [load]);

  useEffect(() => {
    trackOnboardingEvent('onboarding_viewed');
    void pollPayment();
    return clearTimer;
  }, [pollPayment]);

  // Coming back from Discord, Telegram or another tab: refresh.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // The Discord callback result is shown once; drop it from the address bar.
  useEffect(() => {
    if (!discordLinked && !discordError) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('discord');
    url.searchParams.delete('error');
    window.history.replaceState(window.history.state, '', url.toString());
  }, [discordLinked, discordError]);

  const tier = status?.membership?.tier;
  const plan = status?.membership?.term;

  useEffect(() => {
    if (!status) return;
    const funnel = { tier, plan };
    if (status.payment === 'verified' && checkoutId) trackOnboardingEvent('payment_verified', funnel, { oncePerSession: true });
    if (discordLinked && status.connections.discord.nextAction !== 'connect') trackOnboardingEvent('discord_linked', funnel);
    const telegramLinked = status.membership !== null && status.connections.telegram.nextAction !== 'connect';
    if (telegramWasLinked.current === false && telegramLinked) trackOnboardingEvent('telegram_linked', funnel);
    telegramWasLinked.current = status.membership ? telegramLinked : null;
    if (status.profile.completed && status.connections.discord.status === 'active' && status.connections.telegram.status === 'active') {
      trackOnboardingEvent('onboarding_completed', funnel, { oncePerSession: true });
    }
  }, [status, checkoutId, discordLinked, tier, plan]);

  const awaitTelegram = useCallback(() => {
    clearTimer();
    telegramPolls.current = 0;
    const tick = async () => {
      telegramPolls.current += 1;
      await load();
      if (telegramPolls.current < TELEGRAM_POLL_LIMIT) timer.current = setTimeout(() => void tick(), TELEGRAM_POLL_MS);
    };
    timer.current = setTimeout(() => void tick(), TELEGRAM_POLL_MS);
  }, [load]);

  const refreshSoon = useCallback(() => {
    void load();
    setTimeout(() => void load(), 4000);
  }, [load]);
  useUnlinkPolling(status?.connections, load);

  const support = (
    <p className="text-center text-step-sm text-ink-3">
      {t('support.prefix')}{' '}
      <a href={`mailto:${supportEmail}`} className="text-foreground underline underline-offset-4">
        {supportEmail}
      </a>
    </p>
  );

  const checkAgain = (
    <Button
      type="button"
      variant="outline"
      className="gap-2"
      onClick={() => {
        attempt.current = 0;
        setPaymentSlow(false);
        void pollPayment();
      }}
    >
      <RefreshCw aria-hidden />
      {t('verifying.checkAgain')}
    </Button>
  );

  let body: ReactNode;
  if (!status && loadError) {
    body = (
      <Panel icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.5} />} title={t('loadError.title')} tone="warn">
        <p className="text-step-sm text-ink-2">{t('loadError.desc')}</p>
        {checkAgain}
      </Panel>
    );
  } else if (!status) {
    body = (
      <Panel icon={<Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />} title={t('loading')}>
        <span className="sr-only">{t('loading')}</span>
      </Panel>
    );
  } else if (status.payment === 'not_owner') {
    body = (
      <Panel icon={<CircleSlash className="h-5 w-5" strokeWidth={1.5} />} title={t('notOwner.title')} tone="warn">
        <p className="text-step-sm text-ink-2">{t('notOwner.desc')}</p>
        <Button asChild variant="outline">
          <Link href={{ pathname: '/sign-in', query: { callbackUrl: currentPath() } }}>{t('notOwner.switchAccount')}</Link>
        </Button>
      </Panel>
    );
  } else if (status.payment === 'failed') {
    body = (
      <Panel icon={<CircleSlash className="h-5 w-5" strokeWidth={1.5} />} title={t('failed.title')} tone="warn">
        <p className="text-step-sm text-ink-2">{t('failed.desc')}</p>
        <Button asChild>
          <Link href={{ pathname: '/', hash: 'pricing' }}>{t('failed.cta')}</Link>
        </Button>
      </Panel>
    );
  } else if (!status.membership && (status.payment === 'pending' || status.payment === 'verifying')) {
    body = paymentSlow ? (
      <Panel icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.5} />} title={t('verifying.slowTitle')} tone="warn">
        <p className="text-step-sm text-ink-2">{t('verifying.slowDesc')}</p>
        {checkAgain}
      </Panel>
    ) : (
      <Panel icon={<Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />} title={t('verifying.title')}>
        <p className="text-step-sm text-ink-2">{t('verifying.desc')}</p>
      </Panel>
    );
  } else if (!status.membership) {
    body = (
      <Panel icon={<CircleSlash className="h-5 w-5" strokeWidth={1.5} />} title={t('noMembership.title')}>
        {discordError === 'membership_required' && (
          <p role="alert" className="text-step-sm text-destructive">
            {t('discord.errors.membership_required')}
          </p>
        )}
        <p className="text-step-sm text-ink-2">{t('noMembership.desc')}</p>
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link href={{ pathname: '/', hash: 'pricing' }}>{t('noMembership.cta')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={{ pathname: '/sign-in', query: { callbackUrl: currentPath() } }}>{t('notOwner.switchAccount')}</Link>
          </Button>
        </div>
      </Panel>
    );
  } else {
    const { profile, connections, membership } = status;
    const allDone = profile.completed && connections.discord.status === 'active' && connections.telegram.status === 'active';
    body = (
      <>
        <p className="mono-label text-center text-ink-3">
          {t('membershipLine', { tier: t(`tier.${membership.tier}`) })}
        </p>

        {allDone && (
          <section aria-labelledby="onboarding-done" className="rounded-sm border border-success/50 bg-success/10 p-5 text-center sm:p-6">
            <h2 id="onboarding-done" className="font-display text-step-xl">{t('done.title')}</h2>
            <p className="mt-2 text-step-sm text-ink-2">{t('done.desc')}</p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/account">{t('done.account')}</Link>
            </Button>
          </section>
        )}

        <ol className="space-y-6">
          <Step numeral="I" label={t('steps.label', { n: 1 })} title={t('profile.title')} done={profile.completed}>
            <p className="text-step-sm text-ink-2">{t('profile.desc')}</p>
            <OnboardingProfileForm
              profile={profile}
              onSaved={(saved, submitted) => {
                setStatus((current) => (current ? { ...current, profile: saved } : current));
                if (submitted && saved.completed) trackOnboardingEvent('profile_completed', { tier, plan });
              }}
            />
          </Step>

          <Step numeral="II" label={t('steps.label', { n: 2 })} title={t('discord.title')} done={connections.discord.status === 'active'}>
            {discordLinked && (
              <p role="status" className="flex items-center gap-2 text-step-sm text-success">
                <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
                {t('discord.linked')}
              </p>
            )}
            {discordError && (
              <p role="alert" className="flex items-start gap-2 text-step-sm text-destructive">
                <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                {t(`discord.errors.${discordError}`)}
              </p>
            )}
            <CommunityConnectionCard provider="discord" connection={connections.discord} onChanged={refreshSoon} allowUnlink />
          </Step>

          <Step numeral="III" label={t('steps.label', { n: 3 })} title={t('telegram.title')} done={connections.telegram.status === 'active'}>
            <CommunityConnectionCard
              provider="telegram"
              connection={connections.telegram}
              onChanged={refreshSoon}
              onAwaitingTelegram={awaitTelegram}
              allowUnlink
            />
          </Step>
        </ol>
      </>
    );
  }

  return (
    <div className="space-y-8">
      {body}
      {support}
    </div>
  );
}

function currentPath(): string {
  if (typeof window === 'undefined') return '/onboarding';
  return `${window.location.pathname}${window.location.search}`;
}
