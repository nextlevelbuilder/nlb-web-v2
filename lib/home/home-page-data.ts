import { getPublishedProducts } from "@/lib/domain/catalog";
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

export interface HomePageData {
  productIds: MembershipProductIds;
  /** null when the count is unavailable: the UI then hides seat meters rather than guessing. */
  seats: SeatAvailability | null;
  activity: MembershipActivity[];
  /** null when the catalog could not be read: the UI then hides the live row. */
  launchedProducts: HomeLaunchedProduct[] | null;
}

const LAUNCHED_PRODUCTS_LIMIT = 6;

async function settle<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[home] ${label} unavailable:`, error);
    return fallback;
  }
}

/** Load every dynamic homepage value. Each source fails independently to an honest empty state. */
export async function loadHomePageData(): Promise<HomePageData> {
  const productIds = membershipProductIds();
  const [seats, activity, launchedProducts] = await Promise.all([
    settle("seat availability", () => getMembershipSeatAvailability(productIds), null),
    settle("membership activity", () => getRecentMembershipActivity(productIds), []),
    settle("published products", async () => {
      const products = await getPublishedProducts({ limit: LAUNCHED_PRODUCTS_LIMIT });
      return products.map((p) => ({ slug: p.slug, title: p.title, tagline: p.tagline, logoUrl: p.logoUrl ?? null, trustScore: p.trustScore }));
    }, null),
  ]);
  return { productIds, seats, activity, launchedProducts };
}
