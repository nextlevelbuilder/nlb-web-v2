/**
 * schema.org JSON-LD builders shared by the public pages.
 *
 * Nodes carry stable `@id`s (`<site>/#organization`, `<site>/#website`, `<site>/#person-<id>`) so page-level
 * graphs (BlogPosting author, Course provider, Product brand) can reference the site graph emitted once in
 * app/layout.tsx instead of repeating it. Output is plain data; serialize with `serializeJsonLd`.
 */
import { FOUNDERS, founderSameAs, pick, type Founder } from "@/lib/constants/home-content";
import { SOCIAL_LINKS } from "@/lib/constants/socials";
import { localizedPath, siteUrl } from "@/lib/seo";

type JsonLd = Record<string, unknown>;

export const organizationId = () => `${siteUrl()}/#organization`;
export const websiteId = () => `${siteUrl()}/#website`;
export const personId = (founderId: Founder["id"]) => `${siteUrl()}/#person-${founderId}`;

const absoluteUrl = (urlOrPath: string) => (/^https?:\/\//i.test(urlOrPath) ? urlOrPath : `${siteUrl()}${urlOrPath.startsWith("/") ? "" : "/"}${urlOrPath}`);

/** Founder lookup by display name, used to link a blog author to the founder's Person node. */
export function founderByName(name: string | null | undefined): Founder | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  return FOUNDERS.find((founder) => founder.name.toLowerCase() === normalized) ?? null;
}

export function founderPersonJsonLd(founder: Founder, locale: string): JsonLd {
  return {
    "@type": "Person",
    "@id": personId(founder.id),
    name: founder.name,
    ...(founder.pronunciation ? { alternateName: `${founder.name} ${founder.pronunciation}` } : {}),
    image: absoluteUrl(founder.avatar),
    jobTitle: pick(founder.role, locale),
    description: pick(founder.bio, locale),
    worksFor: [{ "@id": organizationId() }, { "@type": "Organization", name: founder.company.name, url: founder.company.url }],
    sameAs: founderSameAs(founder),
  };
}

/** Organization, WebSite (with a directory SearchAction) and the founders, as one site-wide @graph. */
export function siteGraphJsonLd(locale: string): JsonLd {
  const site = siteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId(),
        name: "Next Level Builders",
        alternateName: "NLB",
        url: site,
        logo: { "@type": "ImageObject", url: `${site}/icon-512.png`, width: 512, height: 512 },
        image: `${site}/opengraph-image`,
        slogan: "Every product starts as a single point of light.",
        sameAs: Object.values(SOCIAL_LINKS),
        founder: FOUNDERS.map((founder) => ({ "@id": personId(founder.id) })),
      },
      {
        "@type": "WebSite",
        "@id": websiteId(),
        name: "Next Level Builders",
        url: site,
        inLanguage: ["en", "vi"],
        publisher: { "@id": organizationId() },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${site}${localizedPath("/build-with-us", locale)}?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      ...FOUNDERS.map((founder) => founderPersonJsonLd(founder, locale)),
    ],
  };
}

export interface BreadcrumbItem {
  name: string;
  /** Unlocalized app path, e.g. "/blog". */
  path: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[], locale: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteUrl()}${localizedPath(item.path, locale)}`,
    })),
  };
}

/**
 * Parses a free-text price from a product pricing tier ("Free", "$0", "$19", "19 USD").
 * Returns null when the amount or currency is not stated plainly, so no offer is invented.
 */
export function parseTierPrice(price: string): { amount: number; currency: string } | null {
  const text = price.trim();
  if (/^(free|miễn phí|0)$/i.test(text)) return { amount: 0, currency: "USD" };
  const match = text.match(/^(?:\$\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(USD|VND|EUR))$/i);
  if (!match) return null;
  return match[1] !== undefined ? { amount: Number(match[1]), currency: "USD" } : { amount: Number(match[2]), currency: match[3].toUpperCase() };
}

export interface ProductJsonLdInput {
  title: string;
  tagline: string;
  description?: string | null;
  websiteUrl: string;
  logoUrl?: string | null;
  slug: string;
  locale: string;
  categories?: string[];
  tags?: string[];
  pricingTiers?: Array<{ name: string; price: string }>;
  makers?: Array<{ name: string; xHandle?: string | null }>;
}

/** SoftwareApplication for a directory listing; offers only when every tier states a parseable price. */
export function productJsonLd(input: ProductJsonLdInput): JsonLd {
  const pageUrl = `${siteUrl()}${localizedPath(`/products/${input.slug}`, input.locale)}`;
  const parsed = (input.pricingTiers ?? []).map((tier) => ({ tier, price: parseTierPrice(tier.price) }));
  const priced = parsed.length > 0 && parsed.every((entry) => entry.price !== null);
  const currencies = new Set(parsed.map((entry) => entry.price?.currency));
  const offers = priced && currencies.size === 1
    ? parsed.map(({ tier, price }) => ({ "@type": "Offer", name: tier.name, price: price!.amount, priceCurrency: price!.currency, url: input.websiteUrl }))
    : null;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${pageUrl}#software`,
    name: input.title,
    headline: input.tagline,
    description: input.description || input.tagline,
    url: input.websiteUrl,
    mainEntityOfPage: pageUrl,
    ...(input.logoUrl ? { image: absoluteUrl(input.logoUrl) } : {}),
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    ...(input.categories?.length ? { applicationSubCategory: input.categories[0] } : {}),
    ...(input.tags?.length ? { keywords: input.tags.join(", ") } : {}),
    ...(offers ? { offers } : {}),
    ...(input.makers?.length
      ? { author: input.makers.map((maker) => {
          const founder = founderByName(maker.name);
          return founder ? { "@id": personId(founder.id), "@type": "Person", name: founder.name } : { "@type": "Person", name: maker.name, ...(maker.xHandle ? { sameAs: [`https://x.com/${maker.xHandle.replace(/^@/, "")}`] } : {}) };
        }) }
      : {}),
  };
}

export interface CourseJsonLdInput {
  slug: string;
  title: string;
  description: string;
  locale: string;
  priceCents: number;
  currency: string;
  durationSec?: number;
}

/** A course video as a schema.org Course with its price as an Offer. */
export function courseJsonLd(input: CourseJsonLdInput): JsonLd {
  const url = `${siteUrl()}${localizedPath(`/courses/${input.slug}`, input.locale)}`;
  const minutes = input.durationSec ? Math.max(1, Math.round(input.durationSec / 60)) : 0;
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${url}#course`,
    name: input.title,
    description: input.description || input.title,
    url,
    inLanguage: input.locale,
    provider: { "@id": organizationId(), "@type": "Organization", name: "Next Level Builders", sameAs: siteUrl() },
    isAccessibleForFree: input.priceCents === 0,
    offers: { "@type": "Offer", category: input.priceCents === 0 ? "Free" : "Paid", price: input.priceCents / 100, priceCurrency: input.currency.toUpperCase(), url },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", ...(minutes ? { courseWorkload: `PT${minutes}M` } : {}) },
  };
}

/** The courses index as an ItemList of Course entries. */
export function courseListJsonLd(courses: CourseJsonLdInput[], locale: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url: `${siteUrl()}${localizedPath("/courses", locale)}`,
    itemListElement: courses.map((course, index) => {
      const { "@context": _context, ...item } = courseJsonLd(course);
      void _context;
      return { "@type": "ListItem", position: index + 1, item };
    }),
  };
}

export interface CommunityWrappedJsonLdInput {
  year: number;
  locale: string;
  /** Visible page title and description. */
  name: string;
  description: string;
  /** Local (Asia/Ho_Chi_Minh) dates the figures cover, `YYYY-MM-DD`. */
  coverageStart: string;
  coverageEnd: string;
  status: "provisional" | "final";
  version: number;
  modifiedAt: Date;
}

/** Community Wrapped as a schema.org Dataset of aggregate community figures, created by NLB. */
export function communityWrappedJsonLd(input: CommunityWrappedJsonLdInput): JsonLd {
  const url = `${siteUrl()}${localizedPath(`/wrapped/${input.year}`, input.locale)}`;
  const organization = { "@id": organizationId(), "@type": "Organization", name: "Next Level Builders", url: siteUrl() };
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    name: input.name,
    description: input.description,
    url,
    inLanguage: input.locale,
    temporalCoverage: `${input.coverageStart}/${input.coverageEnd}`,
    creator: organization,
    publisher: organization,
    isAccessibleForFree: true,
    version: String(input.version),
    creativeWorkStatus: input.status === "final" ? "Final" : "Provisional",
    dateModified: input.modifiedAt.toISOString(),
  };
}

export interface HallOfFameJsonLdInput {
  year: number;
  locale: string;
  /** Visible page title and description. */
  name: string;
  description: string;
  /** Listed members of the overall board, in rank order, as shown on the page. */
  members: { name: string; passportPath: string | null }[];
  modifiedAt: Date;
}

/** The final annual Hall of Fame as an ItemList of the overall board's listed (opted-in) members. */
export function hallOfFameJsonLd(input: HallOfFameJsonLdInput): JsonLd {
  const url = `${siteUrl()}${localizedPath(`/wrapped/${input.year}/hall-of-fame`, input.locale)}`;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${url}#hall-of-fame`,
    name: input.name,
    description: input.description,
    url,
    inLanguage: input.locale,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: input.members.length,
    dateModified: input.modifiedAt.toISOString(),
    itemListElement: input.members.map((member, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Person",
        name: member.name,
        ...(member.passportPath ? { url: `${siteUrl()}${localizedPath(member.passportPath, input.locale)}` } : {}),
      },
    })),
  };
}
