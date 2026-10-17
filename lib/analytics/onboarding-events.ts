import posthog from 'posthog-js';

export type OnboardingFunnelEvent =
  | 'onboarding_viewed'
  | 'payment_verified'
  | 'profile_completed'
  | 'discord_linked'
  | 'telegram_linked'
  | 'onboarding_completed';

/** The only properties funnel events may carry: no emails, names or ids. */
export interface OnboardingEventProps {
  tier?: 'premium' | 'vip' | 'none';
  plan?: 'quarterly' | 'annual' | null;
}

const ONCE_PREFIX = 'nlb_onb_evt:';
const sentThisPage = new Set<string>();

/** Strip anything that is not tier or plan, so a caller can never leak personal data into an event. */
export function onboardingEventProperties(props: OnboardingEventProps = {}): OnboardingEventProps {
  const safe: OnboardingEventProps = {};
  if (props.tier === 'premium' || props.tier === 'vip' || props.tier === 'none') safe.tier = props.tier;
  if (props.plan === 'quarterly' || props.plan === 'annual') safe.plan = props.plan;
  return safe;
}

/**
 * Capture a funnel step through the site PostHog instance (production host only, DNT/GPC respected
 * by its initializer). Each event fires at most once per page load; `oncePerSession` also
 * suppresses repeats across reloads in the same tab.
 */
export function trackOnboardingEvent(
  event: OnboardingFunnelEvent,
  props: OnboardingEventProps = {},
  { oncePerSession = false }: { oncePerSession?: boolean } = {}
): void {
  if (typeof window === 'undefined' || sentThisPage.has(event)) return;
  sentThisPage.add(event);
  if (oncePerSession) {
    try {
      if (window.sessionStorage.getItem(ONCE_PREFIX + event)) return;
      window.sessionStorage.setItem(ONCE_PREFIX + event, '1');
    } catch {
      // Storage blocked: the per-page guard still applies.
    }
  }
  try {
    if (!(posthog as unknown as { __loaded?: boolean }).__loaded) return;
    posthog.capture(event, onboardingEventProperties(props));
  } catch {
    // Analytics must never break onboarding.
  }
}
