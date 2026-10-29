import { startNavigation } from "@/lib/navigation/navigation-progress-store";

/** Next calls this when an App Router navigation (link, router.push/replace, back/forward) starts. */
export function onRouterTransitionStart(url: string) {
  startNavigation(url, window.location.href);
}
