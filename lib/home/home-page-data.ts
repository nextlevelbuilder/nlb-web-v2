import { getDb } from "@/lib/db";
import { listPublishedVideos } from "@/lib/courses/course-video-service";
import { listPostSummaries } from "@/lib/blog/blog-queries";
import { isBlogLocale } from "@/lib/blog/blog-types";
import { getPublishedProducts } from "@/lib/domain/catalog";
import { getLatestRankingSnapshot } from "@/lib/domain/rankings";
import { pickLatestCourseVideos, type HomeCourseVideo } from "./home-course-videos";
import { buildHomeLeaderboard, type HomeLeaderboardEntry } from "./home-leaderboard";
import { getMembershipSeatAvailability, type SeatAvailability } from "./membership-seats";
import { getRecentMembershipActivity, type MembershipActivity } from "./recent-membership-activity";
import { membershipProductIds, type MembershipProductIds } from "./membership-product-ids";

/** Minimal public shape of a published Directory product for the homepage. */
export interface HomeLaunchedProduct {
  slug: string;
  title: string;
  tagline: string;
  logoUrl: string | null;
  trustScore: number;
}

export interface HomeBlogPost {
  slug: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
}

export interface HomePageData {
  productIds: MembershipProductIds;
  /** null when the count is unavailable: the UI then hides seat meters rather than guessing. */
  seats: SeatAvailability | null;
  activity: MembershipActivity[];
  /** null when the catalog could not be read: the UI then hides the live row. */
  launchedProducts: HomeLaunchedProduct[] | null;
  /** Latest published videos; empty renders the explanatory cards instead. */
  courseVideos: HomeCourseVideo[];
  /** Read-only leaderboard (latest daily snapshot); empty renders open magnitudes only. */
  leaderboard: HomeLeaderboardEntry[];
  /** Latest posts in the visitor's language; empty hides the logbook teaser. */
  blogPosts: HomeBlogPost[];
}

const LAUNCHED_PRODUCTS_LIMIT = 6;
const CATALOG_LIMIT = 24;
const BLOG_TEASER_LIMIT = 3;

async function settle<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[home] ${label} unavailable:`, error);
    return fallback;
  }
}

/** Load every dynamic homepage value. Each source fails independently to an honest empty state. */
export async function loadHomePageData(locale: string): Promise<HomePageData> {
  const productIds = membershipProductIds();
  const catalog = settle("published products", () => getPublishedProducts({ limit: CATALOG_LIMIT }), null);
  const [seats, activity, products, snapshot, courseVideos, blogPosts] = await Promise.all([
    settle("seat availability", () => getMembershipSeatAvailability(productIds), null),
    settle("membership activity", () => getRecentMembershipActivity(productIds), []),
    catalog,
    settle("ranking snapshot", () => getLatestRankingSnapshot("daily"), undefined),
    settle("course videos", async () => {
      const rows = await listPublishedVideos(getDb());
      return pickLatestCourseVideos(rows.map((v) => ({
        slug: v.slug, title: v.title, locale: v.locale, weekNumber: v.weekNumber ?? null, durationSec: v.durationSec,
        priceCents: v.priceCents, currency: v.currency, thumbnailUrl: v.thumbnailUrl ?? null,
        publishedAt: v.publishedAt ? v.publishedAt.getTime() : null,
      })), locale);
    }, []),
    settle("blog posts", async () => {
      if (!isBlogLocale(locale)) return [];
      const rows = await listPostSummaries({ status: "published", locale, limit: BLOG_TEASER_LIMIT, offset: 0 });
      return rows.map((p) => ({ slug: p.slug, title: p.title, description: p.description, publishedAt: p.publishedAt }));
    }, []),
  ]);

  const launchedProducts = products
    ? products.slice(0, LAUNCHED_PRODUCTS_LIMIT).map((p) => ({ slug: p.slug, title: p.title, tagline: p.tagline, logoUrl: p.logoUrl ?? null, trustScore: p.trustScore }))
    : null;
  const leaderboard = products
    ? buildHomeLeaderboard(products.map((p) => ({ id: p.id, slug: p.slug, title: p.title, tagline: p.tagline, trustScore: p.trustScore })), snapshot?.ranks)
    : [];

  return { productIds, seats, activity, launchedProducts, courseVideos, leaderboard, blogPosts };
}
