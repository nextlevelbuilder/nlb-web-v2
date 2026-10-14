/**
 * Read-only homepage leaderboard: published products joined with the latest daily ranking snapshot.
 * The homepage never computes rankings; it only reads what the scheduled job stored.
 */
export interface LeaderboardProduct {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  trustScore: number;
}

export interface HomeLeaderboardEntry {
  slug: string;
  title: string;
  tagline: string;
  trustScore: number;
  votes: number;
}

export const HOME_LEADERBOARD_SIZE = 5;

/** Vote counts per product from a snapshot's `ranks` JSON. Malformed rows are ignored. */
export function votesFromRanks(ranks: unknown): Map<string, number> {
  const votes = new Map<string, number>();
  if (!Array.isArray(ranks)) return votes;
  for (const row of ranks) {
    if (!row || typeof row !== 'object') continue;
    const { productId, voteCount } = row as { productId?: unknown; voteCount?: unknown };
    const count = Number(voteCount);
    if (typeof productId === 'string' && Number.isFinite(count) && count >= 0) votes.set(productId, Math.floor(count));
  }
  return votes;
}

/** Top products by today's votes, then Trust, then title (stable). */
export function buildHomeLeaderboard(products: LeaderboardProduct[], ranks: unknown, size = HOME_LEADERBOARD_SIZE): HomeLeaderboardEntry[] {
  const votes = votesFromRanks(ranks);
  return products
    .map((p) => ({ slug: p.slug, title: p.title, tagline: p.tagline, trustScore: Math.round(p.trustScore), votes: votes.get(p.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes || b.trustScore - a.trustScore || a.title.localeCompare(b.title))
    .slice(0, size);
}
