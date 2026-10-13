import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), select: vi.fn(), results: [] as unknown[][] }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/lib/db', () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/components/navbar', () => ({ default: () => null }));
vi.mock('@/components/sections/footer-section', () => ({ default: () => null }));
vi.mock('@/components/blocks/block-renderer', () => ({ BlockRenderer: () => null }));
vi.mock('@/components/studio/preview-publish-button', () => ({ default: () => null }));

import PreviewPage, { metadata } from '@/app/[locale]/studio/products/[slug]/preview/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.results = [];
  mocks.select.mockImplementation(() => {
    const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit: async () => mocks.results.shift() || [] };
    return chain;
  });
});

const params = Promise.resolve({ locale: 'en', slug: 'tool' });
const product = (status: string) => ({ id: 'product', orgId: 'org', slug: 'tool', title: 'Tool', status });
const revision = { revisionNumber: 2, document: { blocks: [] }, contentHash: 'hash' };

describe('Studio candidate revision authorization', () => {
  it.each(['published', 'draft'])('hides %s product previews from signed-out visitors before fetching revisions', async (status) => {
    mocks.getSession.mockResolvedValue(null);
    mocks.results = [[product(status)]];
    await expect(PreviewPage({ params })).rejects.toThrow('NOT_FOUND');
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('hides unpublished edits to live products from nonmembers', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'outsider', role: 'user' } });
    mocks.results = [[product('published')], []];
    await expect(PreviewPage({ params })).rejects.toThrow('NOT_FOUND');
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it('allows an organization member to preview its candidate revision', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'member', role: 'user' } });
    mocks.results = [[product('published')], [{ userId: 'member' }], [revision]];
    await expect(PreviewPage({ params })).resolves.toBeDefined();
    expect(mocks.select).toHaveBeenCalledTimes(3);
  });

  it('allows administrators and excludes previews from indexing', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    mocks.results = [[product('draft')], [revision]];
    await expect(PreviewPage({ params })).resolves.toBeDefined();
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
