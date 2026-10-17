'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from '@/i18n/navigation';
import { hydrateSound, onSoundVisibilityChange, playEffect, resumeSound } from '@/lib/site-audio/site-sound-engine';

/** Elements that chime when the pointer reaches them: the sky-chart stars and the leaderboard rows. */
const TWINKLE_TARGETS = '.pstar, .lb-row, [data-sfx="twinkle"]';
const TAP_TARGETS = 'a[href], button, [role="button"], summary, label';

/**
 * Wires site-wide sound with delegated listeners, so no component needs to know about audio:
 * a tap on clicks, a twinkle when a fine pointer enters a star, a whoosh on page change. Renders
 * nothing. Effects play only after the visitor turned sound on (see SoundToggle).
 */
export default function SiteSoundEffects() {
  const pathname = usePathname();
  const firstPath = useRef(true);

  useEffect(() => {
    hydrateSound();
    // A stored "on" can only start audio inside a gesture, so the first interaction resumes it.
    const onGesture = () => resumeSound();
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>(TAP_TARGETS);
      if (!target || target.closest('[data-sfx="none"]')) return;
      playEffect('tap');
    };
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let hovered: Element | null = null;
    const onOver = (event: PointerEvent) => {
      if (!finePointer.matches) return;
      const target = (event.target as Element | null)?.closest(TWINKLE_TARGETS) ?? null;
      if (target && target !== hovered) playEffect('twinkle');
      hovered = target;
    };
    window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
    window.addEventListener('keydown', onGesture, { capture: true });
    document.addEventListener('click', onClick, { capture: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('visibilitychange', onSoundVisibilityChange);
    return () => {
      window.removeEventListener('pointerdown', onGesture, { capture: true });
      window.removeEventListener('keydown', onGesture, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('visibilitychange', onSoundVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    playEffect('whoosh');
  }, [pathname]);

  return null;
}
