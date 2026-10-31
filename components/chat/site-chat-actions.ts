import type { PageAction } from 'dewee-webchat';
import { OPEN_CHECKOUT_EVENT } from '@/components/checkout/use-checkout-deep-link';
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
 * Page actions the Dewee agent can call. Agent arguments are untrusted: every handler validates them
 * and only builds same-site URLs. Leads are `mutate`, so the widget asks the visitor before saving,
 * and that approval is the consent recorded with the lead.
 */
export function buildSiteChatActions({ locale, push }: SiteChatActionDeps): PageAction[] {
  return [
    {
      name: 'site.catalog',
      description:
        'Current plans (Premium, VIP) with prices, features, seats left and checkout links; published courses with links and prices; FAQ; key page links. Call this before quoting any price, feature or link.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      sensitivity: 'read',
      handler: async (_args, ctx) => {
        const response = await fetch(`/api/chat/catalog?locale=${locale}`, { signal: ctx.signal });
        if (!response.ok) throw new Error('Catalog unavailable');
        return response.json();
      },
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
