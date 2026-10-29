import RouteLoadingSkeleton from '@/components/site/route-loading-skeleton';

/** Ranking snapshots can be computed on demand, so show the page frame at once while they load. */
export default function Loading() {
  return <RouteLoadingSkeleton />;
}
