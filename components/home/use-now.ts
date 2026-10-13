'use client';

import { useSyncExternalStore } from 'react';

/*
 * One shared 1-second clock for every countdown on the page. The server snapshot is `null`, so
 * time-dependent text renders only after hydration and never causes a hydration mismatch.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let current = 0;

const wholeSecond = () => Math.floor(Date.now() / 1000) * 1000;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    current = wholeSecond();
    timer = setInterval(() => {
      current = wholeSecond();
      listeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => (timer ? current : wholeSecond());
const getServerSnapshot = () => null;

/** Current time in ms, rounded to the second; `null` during SSR and hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
