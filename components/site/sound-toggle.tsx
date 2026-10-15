'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { isSoundEnabled, setSoundEnabled, subscribeSound } from '@/lib/site-audio/site-sound-engine';

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="none" stroke="currentColor" strokeLinejoin="round" />
      {on ? (
        <path d="M10.6 5.6a3.4 3.4 0 010 4.8M12.4 3.8a6 6 0 010 8.4" fill="none" stroke="currentColor" strokeLinecap="round" />
      ) : (
        <path d="M10.5 6l3.5 4M14 6l-3.5 4" fill="none" stroke="currentColor" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * Music + sound effects switch, styled as a one-button segmented control next to the theme switch.
 * Icon with an accessible name in the header, a text label in the mobile menu. Off by default.
 */
export default function SoundToggle({ labelled = false }: { labelled?: boolean }) {
  const t = useTranslations('shell.sound');
  const on = useSyncExternalStore(subscribeSound, isSoundEnabled, () => false);
  const label = on ? t('turnOff') : t('turnOn');

  return (
    <div className="seg sound-seg" role="group" aria-label={t('label')}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={labelled ? undefined : label}
        title={labelled ? undefined : label}
        data-sfx="none"
        onClick={() => setSoundEnabled(!on)}
      >
        {labelled ? <><SoundIcon on={on} /><span>{t(on ? 'on' : 'off')}</span></> : <SoundIcon on={on} />}
      </button>
    </div>
  );
}
