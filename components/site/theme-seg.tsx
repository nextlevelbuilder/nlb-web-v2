'use client';

import { useRef, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';

const OPTIONS = ['system', 'light', 'dark'] as const;
type ThemeOption = (typeof OPTIONS)[number];
const subscribeNever = () => () => {};

function ThemeIcon({ option }: { option: ThemeOption }) {
  if (option === 'system') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" />
        <path d="M8 2a6 6 0 010 12z" fill="currentColor" />
      </svg>
    );
  }
  if (option === 'light') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z" fill="none" stroke="currentColor" strokeLinejoin="round" />
      <circle cx="12" cy="3.5" r=".8" fill="currentColor" />
    </svg>
  );
}

/**
 * System · Light · Dark segmented control. Icons with accessible names in the header, text labels in
 * the mobile menu. The pressed state renders only after mount (the stored preference lives in the
 * browser); a short `theme-anim` class crossfades colours on an explicit switch.
 */
export default function ThemeSeg({ labelled = false }: { labelled?: boolean }) {
  const t = useTranslations('shell.theme');
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const choose = (option: ThemeOption) => {
    const html = document.documentElement;
    html.classList.add('theme-anim');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => html.classList.remove('theme-anim'), 700);
    setTheme(option);
  };

  return (
    <div className="seg theme-seg" role="group" aria-label={t('label')}>
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          data-set-theme={option}
          aria-pressed={mounted ? (theme ?? 'system') === option : undefined}
          aria-label={labelled ? undefined : t(option)}
          title={labelled ? undefined : t(option)}
          onClick={() => choose(option)}
        >
          {labelled ? t(option) : <ThemeIcon option={option} />}
        </button>
      ))}
    </div>
  );
}
