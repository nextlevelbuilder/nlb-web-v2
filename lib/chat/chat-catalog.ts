import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import type { AppDb } from "@/lib/db";
import type { Locale } from "@/i18n/routing";
import { DISCORD_INVITE_URL } from "@/lib/constants/socials";
import { MEMBERSHIP_PLANS, MEMBERSHIP_PLAN_NAMES, MEMBERSHIP_PRICES, type BillingCycle, type MembershipPlan } from "@/lib/constants/launch";
import { readCourseAccessPlans } from "@/lib/courses/course-access-policy";
import { listPublishedVideos } from "@/lib/courses/course-video-service";
import { HOME_FAQ_KEYS } from "@/lib/home/home-faq";
import type { SeatAvailability } from "@/lib/home/membership-seats";
import { localizedPath, siteUrl } from "@/lib/seo";

/**
 * What the chat agent knows about the offer, built from the same sources the pages render: prices
 * and seat caps from `lib/constants/launch`, plan features and FAQ from the message catalogues, real
 * seat counts, and the published course videos. The agent reads it through the `site.catalog` page
 * action, so it never quotes a price or a course from memory.
 */

const MESSAGES = { en, vi } as const;

const PLAN_FEATURE_KEYS: Record<MembershipPlan, readonly string[]> = {
  premium: ["p1", "p2", "p3", "p4"],
  vip: ["v1", "v2", "v3", "v4", "v5", "v6"],
};

const BILLING_CYCLES: readonly BillingCycle[] = ["quarterly", "annual"];

/** Opens the existing pre-checkout dialog (plan, price, Terms) on the pricing chapter of the home page. */
export function membershipCheckoutLink(origin: string, locale: Locale, plan: MembershipPlan, billing: BillingCycle): string {
  return `${origin}${localizedPath("/", locale)}?checkout=${plan}&billing=${billing}#pricing`;
}

export interface ChatCatalog {
  site: string;
  locale: Locale;
  currency: "USD";
  plans: Array<{
    plan: MembershipPlan;
    name: string;
    audience: string;
    features: string[];
    prices: Record<BillingCycle, { amount: number; perMonth: number; checkoutUrl: string }>;
    seats: { total: number; left: number; soldOut: boolean } | null;
  }>;
  guarantee: string;
  courseAccess: { plans: string[]; note: string };
  courses: Array<{ title: string; url: string; locale: string; priceUsd: number; durationMinutes: number; week: number | null }>;
  faq: Array<{ question: string; answer: string }>;
  links: Record<"pricing" | "courses" | "blog" | "buildWithUs" | "refundPolicy" | "terms" | "signIn" | "discord", string>;
}

export async function buildChatCatalog(opts: {
  locale: Locale;
  db: AppDb;
  seats: SeatAvailability | null;
  courseAccessPlans?: string | null;
  origin?: string;
}): Promise<ChatCatalog> {
  const { locale, db, seats } = opts;
  const origin = opts.origin ?? siteUrl();
  const messages = MESSAGES[locale];
  const pricing = messages.home.pricing as Record<string, unknown>;
  const text = (key: string) => (typeof pricing[key] === "string" ? (pricing[key] as string) : "");
  const page = (path: string) => `${origin}${localizedPath(path, locale)}`;
  const accessPlans = readCourseAccessPlans(opts.courseAccessPlans);
  const videos = await listPublishedVideos(db);

  return {
    site: origin,
    locale,
    currency: "USD",
    plans: MEMBERSHIP_PLANS.map((plan) => ({
      plan,
      name: MEMBERSHIP_PLAN_NAMES[plan],
      audience: text(`${plan}Who`),
      features: PLAN_FEATURE_KEYS[plan].map(text).filter(Boolean),
      prices: Object.fromEntries(
        BILLING_CYCLES.map((billing) => [
          billing,
          { ...MEMBERSHIP_PRICES[plan][billing], checkoutUrl: membershipCheckoutLink(origin, locale, plan, billing) },
        ])
      ) as ChatCatalog["plans"][number]["prices"],
      seats: seats ? { total: seats[plan].total, left: seats[plan].left, soldOut: seats[plan].soldOut } : null,
    })),
    guarantee: text("note"),
    courseAccess: {
      plans: accessPlans.map((plan) => MEMBERSHIP_PLAN_NAMES[plan]),
      note:
        locale === "vi"
          ? "Thành viên các gói này xem được mọi video khoá học. Người khác mua lẻ từng video trên trang của video đó (cần đăng nhập)."
          : "Members on these plans watch every course video. Anyone else buys a single video on its page (sign-in required).",
    },
    courses: videos.map((video) => ({
      title: video.title,
      url: page(`/courses/${video.slug}`),
      locale: video.locale,
      priceUsd: video.priceCents / 100,
      durationMinutes: Math.round(video.durationSec / 60),
      week: video.weekNumber ?? null,
    })),
    faq: HOME_FAQ_KEYS.map((key) => {
      const item = (messages.faq.items as Record<string, { question: string; answer: string }>)[key];
      return item ? { question: item.question, answer: item.answer } : null;
    }).filter((item): item is { question: string; answer: string } => item !== null),
    links: {
      pricing: `${page("/")}#pricing`,
      courses: page("/courses"),
      blog: page("/blog"),
      buildWithUs: page("/build-with-us"),
      refundPolicy: page("/policies/refund"),
      terms: page("/policies/terms"),
      signIn: page("/sign-in"),
      discord: DISCORD_INVITE_URL,
    },
  };
}
