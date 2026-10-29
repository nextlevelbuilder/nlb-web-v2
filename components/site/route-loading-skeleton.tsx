/**
 * Route-level fallback for slow pages (`loading.tsx`): the inner-page masthead and a list drawn as
 * hairline bars. Decorative only — no text, so Markdown twins of a streamed page stay clean, and
 * the navigation progress bar's live region is what announces the wait.
 */
export default function RouteLoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <main id="main" className="sky-backdrop flex-1" aria-busy="true">
      <div className="route-skeleton wrap max-w-4xl space-y-12 pb-section-sm pt-[calc(var(--header-h)+3rem)]" aria-hidden="true">
        <div className="space-y-5">
          <span className="route-skeleton-bar block h-3 w-32" />
          <span className="route-skeleton-bar block h-12 w-full max-w-[28rem]" />
          <span className="route-skeleton-bar block h-4 w-full max-w-[36rem]" />
          <span className="route-skeleton-bar block h-4 w-3/4 max-w-[26rem]" />
        </div>
        <div className="divide-y divide-line border-y border-line">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-4 py-5">
              <span className="route-skeleton-bar block h-10 w-10 shrink-0 rounded-full" />
              <span className="flex-1 space-y-2">
                <span className="route-skeleton-bar block h-4 w-2/5" />
                <span className="route-skeleton-bar block h-3 w-3/5" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
