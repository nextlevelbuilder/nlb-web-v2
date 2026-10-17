'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConnectionSummary } from '@/lib/onboarding/status';
import {
  createTelegramJoinLink,
  createTelegramLink,
  discordStartUrl,
  OnboardingApiError,
  openExternal,
  retryCommunityAccess,
  unlinkCommunityAccount,
  type CommunityProvider,
} from './onboarding-api';

const STATUS_TONE: Record<ConnectionSummary['status'], string> = {
  active: 'border-success/50 text-success',
  processing: 'border-line-strong text-ink-2',
  retrying: 'border-warning/50 text-warning',
  waiting_for_join: 'border-warning/50 text-warning',
  action_required: 'border-destructive/50 text-destructive',
  revoked: 'border-line-strong text-ink-3',
  not_connected: 'border-line-strong text-ink-3',
};

export interface CommunityConnectionCardProps {
  provider: CommunityProvider;
  connection: ConnectionSummary;
  /** Account page shows unlink; onboarding keeps the path forward only. */
  allowUnlink?: boolean;
  /** Called after an action that changes server state, so the parent can refresh status. */
  onChanged: () => void;
  /** Called after a Telegram deep link was opened, so the parent can poll for the link. */
  onAwaitingTelegram?: () => void;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}

/** One community (Discord or Telegram): current access, the next action and recovery actions. */
export default function CommunityConnectionCard({
  provider,
  connection,
  allowUnlink = false,
  onChanged,
  onAwaitingTelegram,
  headingLevel: Heading = 'h3',
  className,
}: CommunityConnectionCardProps) {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const [busy, setBusy] = useState<null | 'primary' | 'retry' | 'unlink'>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const name = t(`${provider}.name`);
  const unlinking = connection.unlinking === true;
  // With a membership, "connect" is offered exactly when no account is linked.
  const linked =
    connection.nextAction !== 'connect' && (connection.nextAction !== 'none' || connection.status !== 'not_connected');

  // Tell the member when a pending unlink finished (the link is gone on the next status read).
  const wasUnlinking = useRef(unlinking);
  useEffect(() => {
    if (wasUnlinking.current && !unlinking) setNotice({ tone: 'info', text: t('actions.unlinked', { provider: name }) });
    wasUnlinking.current = unlinking;
  }, [unlinking, name, t]);

  const run = async (kind: 'primary' | 'retry' | 'unlink', action: () => Promise<void>) => {
    setBusy(kind);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      if (error instanceof OnboardingApiError && error.status === 429) {
        setNotice({ tone: 'error', text: t('actions.rateLimited', { seconds: Number(error.body.retryAfter ?? 30) }) });
      } else if (kind === 'unlink') {
        setNotice({ tone: 'error', text: t('actions.unlinkFailed') });
      } else {
        setNotice({ tone: 'error', text: t(`${provider}.error`) });
      }
    } finally {
      setBusy(null);
    }
  };

  const retry = () =>
    run('retry', async () => {
      await retryCommunityAccess(provider);
      setNotice({ tone: 'info', text: t('actions.retryQueued') });
      onChanged();
    });

  const unlink = () => {
    if (!window.confirm(t('actions.unlinkConfirm', { provider: name }))) return;
    void run('unlink', async () => {
      await unlinkCommunityAccount(provider);
      setNotice({ tone: 'info', text: t('actions.unlinkQueued', { provider: name }) });
      onChanged();
    });
  };

  const telegramLink = () =>
    run('primary', async () => {
      const { url } = await createTelegramLink();
      openExternal(url);
      setNotice({ tone: 'info', text: t('telegram.openedHint') });
      onAwaitingTelegram?.();
    });

  const telegramJoin = () =>
    run('primary', async () => {
      const { url } = await createTelegramJoinLink();
      openExternal(url);
      setNotice({ tone: 'info', text: t('telegram.joinHint') });
      onAwaitingTelegram?.();
    });

  const primary = (() => {
    const { nextAction } = connection;
    if (provider === 'discord' && (nextAction === 'connect' || nextAction === 'reconnect')) {
      return (
        <Button asChild size="sm" className="gap-2">
          <a href={discordStartUrl(locale)}>
            <ExternalLink aria-hidden />
            {t(nextAction === 'connect' ? 'discord.connect' : 'discord.reconnect')}
          </a>
        </Button>
      );
    }
    if (provider === 'telegram' && (nextAction === 'connect' || nextAction === 'reconnect')) {
      return (
        <Button type="button" size="sm" className="gap-2" onClick={telegramLink} disabled={busy !== null}>
          {busy === 'primary' ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <ExternalLink aria-hidden />}
          {t(nextAction === 'connect' ? 'telegram.connect' : 'telegram.reconnect')}
        </Button>
      );
    }
    if (provider === 'telegram' && nextAction === 'join') {
      return (
        <Button type="button" size="sm" className="gap-2" onClick={telegramJoin} disabled={busy !== null}>
          {busy === 'primary' ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <ExternalLink aria-hidden />}
          {t('telegram.join')}
        </Button>
      );
    }
    return null;
  })();

  const showRetry = connection.nextAction === 'retry' || connection.nextAction === 'reconnect' || connection.nextAction === 'join';
  const unlinkFailed = unlinking && connection.status === 'action_required';

  return (
    <div className={cn('space-y-4 rounded-sm border border-line bg-surface p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Heading className="font-display text-step-lg text-foreground">{name}</Heading>
          <p className="text-step-sm text-ink-2">{t(`${provider}.desc`)}</p>
        </div>
        <Badge variant="outline" className={STATUS_TONE[connection.status]}>
          {unlinking && !unlinkFailed ? t('status.unlinking') : t(`status.${connection.status}`)}
        </Badge>
      </div>

      {connection.displayName && (
        <p className="text-step-sm text-ink-2">
          <span className="mono-label mr-2 text-ink-3">{t('actions.linkedAs')}</span>
          <span className="break-all text-foreground">{connection.displayName}</span>
        </p>
      )}

      {unlinkFailed && (
        <p role="alert" className="text-step-sm text-destructive">
          {t('actions.unlinkFailedCode', { provider: name, code: connection.errorCode ?? 'unknown' })}
        </p>
      )}

      {(primary || showRetry || (allowUnlink && linked && !unlinking)) && (
        <div className="flex flex-wrap items-center gap-2">
          {primary}
          {showRetry && (
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={retry} disabled={busy !== null}>
              {busy === 'retry' ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden />}
              {busy === 'retry' ? t('actions.retrying') : connection.status === 'active' ? t('actions.rejoin') : t('actions.retry')}
            </Button>
          )}
          {allowUnlink && linked && !unlinking && (
            <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={unlink} disabled={busy !== null}>
              {busy === 'unlink' ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Unlink aria-hidden />}
              {t('actions.unlink')}
            </Button>
          )}
        </div>
      )}

      <p
        role={notice?.tone === 'error' ? 'alert' : 'status'}
        className={cn('text-step-sm', notice?.tone === 'error' ? 'text-destructive' : 'text-ink-2', !notice && 'sr-only')}
      >
        {notice?.text ?? ''}
      </p>
    </div>
  );
}
