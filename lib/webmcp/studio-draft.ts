import { z } from 'zod';
import { ProductDocumentSchema, type ProductDocument } from '@nextlevelbuilder/contracts';

export function normalizeStudioSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const StudioDocumentSchema = ProductDocumentSchema.strict().superRefine((document, ctx) => {
  const ids = new Set<string>();
  for (const [index, block] of document.blocks.entries()) {
    if (ids.has(block.id)) ctx.addIssue({ code: 'custom', path: ['blocks', index, 'id'], message: 'Block IDs must be unique' });
    ids.add(block.id);
  }
  if (document.blocks.length > 100) ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'Use at most 100 blocks' });
  const checkUrls = (value: unknown, path: (string | number)[] = []) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      if (/url$/i.test(key) && typeof child === 'string' && !/^https?:\/\//i.test(child)) {
        ctx.addIssue({ code: 'custom', path: childPath, message: 'Use an HTTP or HTTPS URL' });
      }
      checkUrls(child, childPath);
    }
  };
  checkUrls(document);
});

export function validateStudioDocument(value: unknown): ProductDocument {
  return StudioDocumentSchema.parse(value);
}

export function studioError(error: unknown): string {
  return error instanceof z.ZodError
    ? error.issues.map((issue) => issue.path.join('.') + ': ' + issue.message).join('; ')
    : error instanceof Error ? error.message : 'Unable to update the draft';
}

/** Save through the existing membership-protected revision route, creating only on 404. */
export async function saveStudioDraft(input: { slug: string; orgId: string; document: unknown }, request: typeof fetch = fetch) {
  const slug = normalizeStudioSlug(input.slug);
  if (!slug || slug.length > 64) throw new Error('Enter a slug between 1 and 64 characters.');
  const document = validateStudioDocument(input.document);
  const revisionUrl = '/api/v1/products/' + encodeURIComponent(slug) + '/revisions';
  const post = (url: string, body: unknown) => request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const checked = async (response: Response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to save the draft');
    return body;
  };
  let response = await post(revisionUrl, { document });
  if (response.status === 404) {
    if (!input.orgId) throw new Error('An organization is required to create a product.');
    await checked(await post('/api/v1/products', {
      orgId: input.orgId, slug, title: document.title, tagline: document.tagline,
      websiteUrl: document.websiteUrl, logoUrl: document.logoUrl,
    }));
    response = await post(revisionUrl, { document });
  }
  await checked(response);
  return slug;
}
