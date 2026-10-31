'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import type { DeweeChatProps } from 'dewee-webchat/react';
import { buildSiteChatActions } from './site-chat-actions';

/** Signed-in, transactional or full-screen flows where a floating chat would get in the way. */
const HIDDEN_PREFIXES = ['/account', '/profile', '/studio', '/onboarding', '/success', '/sign-in', '/sign-up', '/oauth'];

function isHidden(pathname: string): boolean {
  const path = pathname.replace(/^\/vi(?=\/|$)/, '') || '/';
  return HIDDEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Waits for the load event, then for an idle moment, so the widget never competes with the page. */
function afterPageIdle(run: () => void): () => void {
  let cancelled = false;
  let idleId: number | undefined;
  let timeoutId: number | undefined;
  const schedule = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') idleId = window.requestIdleCallback(run, { timeout: 4000 });
    else timeoutId = setTimeout(run, 1500) as unknown as number;
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', schedule);
    if (idleId !== undefined) window.cancelIdleCallback(idleId);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  };
}

/**
 * Dewee website chat (consulting, support, lead capture). The widget bundle is fetched only after the
 * page is idle and only when /api/chat/status says the backend is configured. All credentials stay
 * in the /api/dewee route; this component holds none.
 */
export default function SiteChat() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('chat');
  const { resolvedTheme } = useTheme();
  const [Widget, setWidget] = useState<ComponentType<DeweeChatProps> | null>(null);
  const [accent, setAccent] = useState<string>();
  const hidden = isHidden(pathname);

  useEffect(() => {
    if (hidden || Widget) return;
    const controller = new AbortController();
    const cancelIdle = afterPageIdle(async () => {
      try {
        const status = (await fetch('/api/chat/status', { signal: controller.signal }).then((r) => r.json())) as { enabled?: boolean };
        if (!status.enabled) return;
        const mod = await import('dewee-webchat/react');
        if (!controller.signal.aborted) setWidget(() => mod.DeweeChat);
      } catch {
        // The chat is optional: a failed status check or bundle load leaves the page as it is.
      }
    });
    return () => {
      controller.abort();
      cancelIdle();
    };
  }, [hidden, Widget]);

  // Follow the site's accent token, which differs between the dark and light themes.
  useEffect(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    if (value.startsWith('#')) setAccent(value);
  }, [resolvedTheme]);

  const actions = useMemo(() => buildSiteChatActions({ locale, push: (href) => router.push(href) }), [locale, router]);

  if (hidden || !Widget) return null;
  return (
    <Widget
      endpoint="/api/dewee"
      locale={locale}
      title={t('title')}
      subtitle={t('subtitle')}
      greeting={t('greeting')}
      intro={t('intro')}
      placeholder={t('placeholder')}
      suggestions={[t('suggestion1'), t('suggestion2'), t('suggestion3')]}
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      accentColor={accent}
      showReasoning={false}
      showToolCalls={false}
      allowAgentSwitch={false}
      actions={actions}
      getPageContext={() => ({ path: window.location.pathname, locale, title: document.title.slice(0, 200) })}
      style={{ ['--dw-font' as string]: 'var(--f-sans)' }}
    />
  );
}
