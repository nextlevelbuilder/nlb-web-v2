import type { OnboardingStatus, ProfileSummary } from '@/lib/onboarding/status';
import type { CommunityProvider, CommunityTarget } from '@/lib/community/types';

export type { OnboardingStatus, ProfileSummary, CommunityProvider, CommunityTarget };

export const ONBOARDING_SUPPORT_EMAIL = 'hello@nextlevelbuilder.io';

/** Error codes the Discord callback appends as `?error=` on the onboarding page. */
export const DISCORD_ERROR_CODES = ['discord_denied', 'discord_state', 'discord_in_use', 'discord_failed'] as const;
export type DiscordErrorCode = (typeof DISCORD_ERROR_CODES)[number];

export const TARGET_FOR: Record<CommunityProvider, CommunityTarget> = {
  discord: 'discord_guild',
  telegram: 'telegram_group',
};

export class OnboardingApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {}
  ) {
    super(code);
  }
}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new OnboardingApiError(response.status, String(body.error ?? 'request_failed'), body);
  return body as T;
}

export function fetchOnboardingStatus(checkoutId?: string | null): Promise<OnboardingStatus> {
  const query = checkoutId ? `?checkout_id=${encodeURIComponent(checkoutId)}` : '';
  return call<OnboardingStatus>(`/api/onboarding/status${query}`);
}

export interface ProfileDraft {
  goal: string;
  profileLinks: string[];
  skills: string;
  phone: string;
  commitmentAccepted: boolean;
}

export async function saveProfile(draft: ProfileDraft, submit: boolean): Promise<ProfileSummary> {
  const { profile } = await call<{ profile: ProfileSummary }>('/api/onboarding/profile', {
    method: 'POST',
    body: JSON.stringify({ ...draft, submit }),
  });
  return profile;
}

export function retryCommunityAccess(provider: CommunityProvider): Promise<{ queued: true }> {
  return call('/api/onboarding/retry', { method: 'POST', body: JSON.stringify({ target: TARGET_FOR[provider] }) });
}

/** Queues the unlink (202): access is removed first, then the link; poll the status for progress. */
export function unlinkCommunityAccount(provider: CommunityProvider): Promise<{ unlinking: true }> {
  return call(`/api/onboarding/connections/${provider}`, { method: 'DELETE' });
}

export function createTelegramLink(): Promise<{ url: string }> {
  return call('/api/onboarding/telegram/link', { method: 'POST', body: '{}' });
}

export function createTelegramJoinLink(): Promise<{ url: string }> {
  return call('/api/onboarding/telegram/join-link', { method: 'POST', body: '{}' });
}

export function discordStartUrl(locale: string): string {
  return `/api/onboarding/discord/start?locale=${encodeURIComponent(locale)}`;
}

/** Open a provider URL in a new tab; when the popup is blocked, navigate this tab instead. */
export function openExternal(url: string): void {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.href = url;
}
