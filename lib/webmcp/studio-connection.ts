import type { StudioToolRegistry, StudioToolState } from './studio-tools';

interface Widget extends StudioToolRegistry { destroy: () => void }

/** Cancel safely even when the user leaves while the optional bundle is loading. */
export function connectStudioTools(
  state: StudioToolState,
  onReady: () => void,
  onError: (error: unknown) => void,
  load: () => Promise<{ default: new () => Widget }> = () => import('./vendor/webmcp'),
): () => void {
  let cancelled = false;
  let widget: Widget | undefined;
  let unregister: (() => void) | undefined;
  void Promise.all([load(), import('./studio-tools')]).then(([{ default: WebMCP }, { registerStudioTools }]) => {
    if (cancelled) return;
    widget = new WebMCP();
    unregister = registerStudioTools(widget, state);
    onReady();
  }).catch((error) => {
    unregister?.();
    widget?.destroy();
    if (!cancelled) onError(error);
  });
  return () => {
    cancelled = true;
    unregister?.();
    widget?.destroy();
    widget = undefined;
  };
}
