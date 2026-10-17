'use client';

import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';
import { useSession } from '@/lib/auth-client';
import { isAnalyticsAllowed, type PrivacySignals } from '@/lib/constants/analytics-consent';
import { beforeSendPostHog, isPostHogHost, POSTHOG_API_HOST, POSTHOG_PROJECT_KEY, POSTHOG_UI_HOST } from '@/lib/analytics/posthog-config';

let initialized = false;

/** Initializes PostHog once per page load, only on the production domain and without DNT/GPC. */
function initPostHog(): boolean {
  if (initialized) return true;
  if (!isPostHogHost(window.location.hostname)) return false;
  if (!isAnalyticsAllowed(navigator as Navigator & PrivacySignals)) return false;
  posthog.init(POSTHOG_PROJECT_KEY, {
    api_host: POSTHOG_API_HOST,
    ui_host: POSTHOG_UI_HOST,
    defaults: '2026-05-30',
    person_profiles: 'identified_only',
    respect_dnt: true,
    // Pageviews on every client-side navigation, plus page leave for time on page and scroll depth.
    capture_pageview: 'history_change',
    capture_pageleave: true,
    autocapture: true,
    capture_heatmaps: true,
    capture_dead_clicks: true,
    capture_exceptions: true,
    capture_performance: { web_vitals: true, network_timing: true },
    // Replays never contain what visitors type (emails, OTP codes, card fields stay on Polar).
    session_recording: { maskAllInputs: true },
    before_send: beforeSendPostHog,
  });
  initialized = true;
  return true;
}

/**
 * Site-wide PostHog: pageviews, autocapture, heatmaps, dead clicks, web vitals, exceptions and
 * session replay. Signed-in members are identified by their user id so funnels follow them across
 * devices; signing out resets the device to a fresh anonymous id.
 */
export default function PostHogAnalytics() {
  const { data: session, isPending } = useSession();
  const identifiedAs = useRef<string | null>(null);

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (isPending || !initPostHog()) return;
    const user = session?.user;
    if (user) {
      if (identifiedAs.current === user.id) return;
      identifiedAs.current = user.id;
      const role = (user as { role?: string | null }).role ?? undefined;
      posthog.identify(user.id, { email: user.email, name: user.name, role });
    } else if (identifiedAs.current || posthog.get_property('$user_state') === 'identified') {
      // Also covers a sign-out in another tab or an expired session found on reload.
      identifiedAs.current = null;
      posthog.reset();
    }
  }, [session?.user, isPending]);

  return null;
}
