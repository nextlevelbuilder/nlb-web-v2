'use client';

import { useEffect } from 'react';

/**
 * Links a board row and its plotted star: hovering or focusing either lights both (`.is-on`),
 * exactly as in the Constellation design. Renders nothing; wires delegated listeners on the chapter.
 */
export default function DirectoryHighlight({ chapterId }: { chapterId: string }) {
  useEffect(() => {
    const root = document.getElementById(chapterId);
    if (!root) return;
    const targetsOf = (i: string) => root.querySelectorAll<Element>(`.lb-row[data-i="${i}"], .pstar[data-i="${i}"]`);
    const indexOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement | SVGElement>('.lb-row[data-i], .pstar[data-i]')?.dataset.i ?? null : null;
    const set = (event: Event, on: boolean) => {
      const i = indexOf(event.target);
      if (i === null) return;
      // Leaving into a child of the same row/star is not a leave.
      if (!on && event instanceof PointerEvent && indexOf(event.relatedTarget) === i) return;
      targetsOf(i).forEach((el) => el.classList.toggle('is-on', on));
    };
    const over = (e: Event) => set(e, true);
    const out = (e: Event) => set(e, false);
    root.addEventListener('pointerover', over);
    root.addEventListener('pointerout', out);
    root.addEventListener('focusin', over);
    root.addEventListener('focusout', out);
    return () => {
      root.removeEventListener('pointerover', over);
      root.removeEventListener('pointerout', out);
      root.removeEventListener('focusin', over);
      root.removeEventListener('focusout', out);
    };
  }, [chapterId]);
  return null;
}
