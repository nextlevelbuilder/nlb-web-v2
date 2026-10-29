/**
 * App Router navigation state for the top progress bar. `instrumentation-client.ts` reports each
 * transition start (Next has no "transition end" hook), and `NavigationProgress` completes it once
 * the committed pathname or search params change. Kept framework-free so it can be unit tested.
 */

type Listener = () => void;

let pending = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** True when `target` only differs from `current` by its hash (or not at all): no route will render. */
export function isSameDocumentTarget(target: string, current: string): boolean {
  try {
    const base = new URL(current);
    const next = new URL(target, base);
    return next.origin === base.origin && next.pathname === base.pathname && next.search === base.search;
  } catch {
    return true;
  }
}

/** Mark a navigation as started, unless it stays on the current document (hash links, same URL). */
export function startNavigation(target: string, current: string) {
  if (isSameDocumentTarget(target, current)) return;
  if (pending) return;
  pending = true;
  emit();
}

export function completeNavigation() {
  if (!pending) return;
  pending = false;
  emit();
}

export function subscribeNavigation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isNavigationPending() {
  return pending;
}
