'use client';

import type { ReactNode } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { MotionConfig } from 'framer-motion';

/** localStorage key for the System / Light / Dark preference. */
export const THEME_STORAGE_KEY = 'nlb-theme';

/**
 * Theme + motion context for every page.
 * next-themes writes the `light` / `dark` class on <html> from an inline script before first paint
 * (no flash). MotionConfig makes every framer-motion animation honour prefers-reduced-motion.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      themes={['light', 'dark']}
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </NextThemesProvider>
  );
}
