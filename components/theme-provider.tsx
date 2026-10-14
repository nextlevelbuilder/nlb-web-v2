'use client';

import type { ReactNode } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { MotionConfig } from 'framer-motion';

/** localStorage key for the System / Light / Dark preference. */
export const THEME_STORAGE_KEY = 'nlb-theme';

/**
 * Theme + motion context for every page.
 * next-themes writes `data-theme="light|dark"` on <html> from an inline script before first paint
 * (no flash); app/constellation-shell.css keys every colour token off that attribute. MotionConfig makes every framer-motion animation honour prefers-reduced-motion.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      themes={['light', 'dark']}
      storageKey={THEME_STORAGE_KEY}
    >
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </NextThemesProvider>
  );
}
