import type { PageAction } from 'dewee-webchat';
import { OPEN_CHECKOUT_EVENT } from '@/components/checkout/use-checkout-deep-link';
import type { ChatCatalog } from '@/lib/chat/chat-catalog';
import { localizedPath } from '@/lib/seo';

/** Pages the agent may open. Slugged pages take a `slug` that matches SLUG. */
const PAGES = {
  home: '/',
  pricing: '/#pricing',
  courses: '/courses',
  course: '/courses/',
  blog: '/blog',
  'blog-post': '/blog/',
  'build-with-us': '/build-with-us',
  product: '/products/',
  'refund-policy': '/policies/refund',
  terms: '/policies/terms',
  'sign-in': '/sign-in',
} as const;
type PageKey = keyof typeof PAGES;
const SLUGGED = new Set<PageKey>(['course', 'blog-post', 'product']);
const SLUG = /^[a-z0-9-]{1,100}$/;

export interface SiteChatActionDeps {
  locale: string;
  /** Client-side navigation (next/navigation router.push). */
  push: (href: string) => void;
}

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/vi(?=\/|$)/, '') || '/';
}

/**
 * The widget replaces an action result longer than 8192 characters with `{ truncated: true }`, so the
 * catalog is served in parts and the course list stops below this budget, saying how many it left out.
 */
const COURSES_RESULT_BUDGET = 7000;

async function fetchCatalog(locale: string, signal: AbortSignal): Promise<ChatCatalog> {
  const response = await fetch(`/api/chat/catalog?locale=${locale}`, { signal });
  if (!response.ok) throw new Error('Catalog unavailable');
  return response.json();
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

export function listCourses(catalog: ChatCatalog, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches = catalog.courses.filter((course) => words.every((word) => fold(course.title).includes(word)));
  const courses = [];
  let size = 0;
  for (const course of matches) {
    const item = {
      title: course.title,
      slug: course.url.slice(course.url.lastIndexOf('/') + 1),
      language: course.locale,
      priceUsd: course.priceUsd,
      minutes: course.durationMinutes,
      week: course.week,
    };
    size += JSON.stringify(item).length + 1;
    if (size > COURSES_RESULT_BUDGET) break;
    courses.push(item);
  }
  return {
    coursesUrl: `${catalog.links.courses}/`,
    total: matches.length,
    courses,
    ...(courses.length < matches.length ? { more: matches.length - courses.length, hint: 'Pass a query to narrow the list.' } : {}),
  };
}

/**
 * Page actions the Dewee agent can call. Agent arguments are untrusted: every handler validates them
 * and only builds same-site URLs. Leads are `mutate`, so the widget asks the visitor before saving,
 * and that approval is the consent recorded with the lead.
 */
export function buildSiteChatActions({ locale, push }: SiteChatActionDeps): PageAction[] {
  return [
    {
      name: 'site.catalog',
      description:
        'Current plans (Premium, VIP) with prices, features, seats left and checkout links; refund guarantee; which plans include courses; key page links. Call this before quoting any price, feature or link. Courses and FAQ have their own actions.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      sensitivity: 'read',
      handler: async (_args, ctx) => {
        const { courses, faq, ...offer } = await fetchCatalog(locale, ctx.signal);
        return { ...offer, courseCount: courses.length, faqCount: faq.length };
      },
    },
    {
      name: 'site.courses',
      description:
        'Published course videos: title, slug, language, price in USD, length and week. A course link is coursesUrl + slug. Pass query to filter by words in the title.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', maxLength: 100 } },
        additionalProperties: false,
      },
      sensitivity: 'read',
      handler: async (args: { query?: unknown }, ctx) => {
        const catalog = await fetchCatalog(locale, ctx.signal);
        return listCourses(catalog, typeof args.query === 'string' ? args.query : '');
      },
    },
    {
      name: 'site.faq',
      description: 'Frequently asked questions with answers (refunds, access, community, payment). Call before answering a policy question.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      sensitivity: 'read',
      handler: async (_args, ctx) => ({ faq: (await fetchCatalog(locale, ctx.signal)).faq }),
    },
    {
      name: 'site.navigate',
      description:
        'Open a page of nextlevelbuilder.io in the visitor\'s tab. Use slug for course, blog-post and product (the last path segment of a catalog link).',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'string', enum: Object.keys(PAGES) },
          slug: { type: 'string', pattern: SLUG.source },
        },
        required: ['page'],
        additionalProperties: false,
      },
      sensitivity: 'navigate',
      handler: (args: { page?: unknown; slug?: unknown }) => {
        const page = args.page as PageKey;
        if (typeof args.page !== 'string' || !(args.page in PAGES)) throw new Error('Unknown page');
        let path: string = PAGES[page];
        if (SLUGGED.has(page)) {
          if (typeof args.slug !== 'string' || !SLUG.test(args.slug)) throw new Error('A valid slug is required');
          path += args.slug;
        }
        const [pathname, hash] = path.split('#');
        const href = `${localizedPath(pathname, locale)}${hash ? `#${hash}` : ''}`;
        push(href);
        return { opened: href };
      },
    },
    {
      name: 'checkout.membership',
      description:
        'Open the checkout dialog for a membership plan on the home page. The visitor still sees the price and accepts the Terms before paying with Polar. Use when the visitor says they want to join.',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', enum: ['premium', 'vip'] },
          billing: { type: 'string', enum: ['quarterly', 'annual'] },
        },
        required: ['plan', 'billing'],
        additionalProperties: false,
      },
      sensitivity: 'navigate',
      handler: (args: { plan?: unknown; billing?: unknown }) => {
        if (args.plan !== 'premium' && args.plan !== 'vip') throw new Error('Unknown plan');
        const billing = args.billing === 'annual' ? 'annual' : 'quarterly';
        if (stripLocale(window.location.pathname) === '/') {
          document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
          window.dispatchEvent(new CustomEvent(OPEN_CHECKOUT_EVENT, { detail: { plan: args.plan, billing } }));
        } else {
          push(`${localizedPath('/', locale)}?checkout=${args.plan}&billing=${billing}#pricing`);
        }
        return { opened: 'checkout', plan: args.plan, billing };
      },
    },
    {
      name: 'lead.save',
      description:
        'Save the visitor\'s contact so the team can follow up. Only call after the visitor gave their name, email and need in this chat. The visitor is asked to approve before anything is saved. Set wantsHuman when they asked to talk to a person.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 120 },
          email: { type: 'string', maxLength: 254 },
          need: { type: 'string', maxLength: 2000 },
          interest: { type: 'string', enum: ['premium', 'vip', 'courses', 'build-with-us', 'other'] },
          wantsHuman: { type: 'boolean' },
        },
        required: ['name', 'email', 'need'],
        additionalProperties: false,
      },
      sensitivity: 'mutate',
      handler: async (args: Record<string, unknown>, ctx) => {
        const response = await fetch('/api/chat/leads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: args.name,
            email: args.email,
            need: args.need,
            interest: args.interest,
            wantsHuman: args.wantsHuman === true,
            locale,
            pagePath: window.location.pathname,
            consent: true,
          }),
          signal: ctx.signal,
        });
        const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string; issues?: string[] };
        if (!response.ok) throw new Error(body.issues?.join('; ') || body.error || 'Could not save the contact');
        return { saved: true, id: body.id };
      },
    },
  ];
}
