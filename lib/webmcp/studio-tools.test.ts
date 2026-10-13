import { describe, expect, it, vi } from 'vitest';
import { registerStudioTools, type StudioToolRegistry } from './studio-tools';
import { connectStudioTools } from './studio-connection';
import { saveStudioDraft, validateStudioDocument } from './studio-draft';
import type { ProductDocument } from '@/packages/contracts/src/product-document';

const draft = (): ProductDocument => ({ schemaVersion: 1, title: 'Builder tool', tagline: 'Build software', description: 'A real developer productivity tool.', websiteUrl: 'https://example.com', categorySlugs: ['developer-tools'], tagSlugs: [], blocks: [] });

function toolHarness() {
  let document = draft();
  const handlers = new Map<string, (args: unknown) => unknown>();
  const registry: StudioToolRegistry = { registerTool: (name, _description, _schema, execute) => { handlers.set(name, execute); } };
  const preview = vi.fn();
  const replaceDocument = vi.fn((value: ProductDocument) => { document = value; });
  const state = { getDocument: () => document, replaceDocument, preview };
  const stop = registerStudioTools(registry, state);
  const call = (name: string, args: unknown = {}) => handlers.get(name)!(args) as { isError?: boolean; content: { text: string }[] };
  const data = (name: string, args?: unknown) => JSON.parse(call(name, args).content[0].text);
  return { state, call, data, stop, preview, replaceDocument, handlers };
}

describe('Studio WebMCP draft tools', () => {
  it('reads live document state after manual and consecutive tool edits', () => {
    const h = toolHarness();
    h.state.replaceDocument({ ...draft(), title: 'Typed in Studio' });
    expect(h.data('studio_inspect_draft').document.title).toBe('Typed in Studio');
    h.call('studio_replace_draft', { document: { ...draft(), title: 'AI design' } });
    expect(h.data('studio_inspect_draft').document.title).toBe('AI design');
    h.call('studio_apply_template', { templateId: 'minimalist' });
    expect(h.state.getDocument().blocks[0]).toMatchObject({ type: 'hero', props: { headline: 'AI design' } });
    h.call('studio_preview_draft');
    expect(h.preview).toHaveBeenCalledOnce();
  });

  it('lists real template blocks and exposes only draft actions', () => {
    const h = toolHarness();
    expect(h.data('studio_list_templates').templates).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'minimalist', blocks: expect.any(Array) })]));
    expect(h.data('studio_list_templates').blockTypes).toEqual(expect.arrayContaining(['activities', 'pulse']));
    expect(h.data('studio_list_templates').documentSchema.properties.blocks).toBeDefined();
    expect([...h.handlers.keys()]).toEqual(['studio_inspect_draft', 'studio_list_templates', 'studio_replace_draft', 'studio_apply_template', 'studio_preview_draft']);
    expect(h.data('studio_inspect_draft').document).not.toHaveProperty('orgId');
  });

  it.each([
    { ...draft(), schemaVersion: '1.0' },
    { ...draft(), description: 'short' },
    { ...draft(), categorySlugs: [] },
    { ...draft(), websiteUrl: 'javascript:alert(1)' },
    { ...draft(), blocks: [{ id: 'bad', type: 'unknown', props: {} }] },
    { ...draft(), blocks: [{ id: 'a', type: 'hero', props: { headline: 'Hello', primaryCtaUrl: 'javascript:alert(1)' } }] },
    { ...draft(), blocks: [{ id: 'a', type: 'pulse', props: { showHistory: true, uptime: 100 } }] },
    { ...draft(), apiKey: 'must-not-be-in-document' },
  ])('rejects invalid/unsafe documents atomically', (document) => {
    const h = toolHarness();
    expect(h.call('studio_replace_draft', { document }).isError).toBe(true);
    expect(h.replaceDocument).not.toHaveBeenCalled();
    expect(h.state.getDocument()).toEqual(draft());
  });

  it('rejects duplicate block ids and unknown templates', () => {
    const h = toolHarness();
    const block = { id: 'duplicate', type: 'pulse', props: { showHistory: true } };
    expect(h.call('studio_replace_draft', { document: { ...draft(), blocks: [block, block] } }).isError).toBe(true);
    expect(h.call('studio_apply_template', { templateId: 'nonexistent' }).isError).toBe(true);
    expect(h.replaceDocument).not.toHaveBeenCalled();
  });

  it('makes retained callbacks inert after disconnect', () => {
    const h = toolHarness();
    h.stop();
    expect(h.call('studio_replace_draft', { document: draft() }).isError).toBe(true);
    expect(h.call('studio_preview_draft').isError).toBe(true);
    expect(h.preview).not.toHaveBeenCalled();
    expect(h.replaceDocument).not.toHaveBeenCalled();
  });

  it('validates truthful empty Activities and Pulse blocks', () => {
    const document = validateStudioDocument({ ...draft(), blocks: [
      { id: 'updates', type: 'activities', props: { entries: [] } },
      { id: 'health', type: 'pulse', props: { showHistory: true } },
    ] });
    expect(document.blocks).toHaveLength(2);
  });
});

describe('Studio draft persistence', () => {
  it('uses one normalized slug and checks creation before writing the revision', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'Not found' }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ data: { slug: 'my-product' } }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ data: { id: 'revision' } }, { status: 201 }));
    expect(await saveStudioDraft({ slug: ' My Product!! ', orgId: 'my-org', document: draft() }, request)).toBe('my-product');
    expect(request.mock.calls.map(([url]) => url)).toEqual(['/api/v1/products/my-product/revisions', '/api/v1/products', '/api/v1/products/my-product/revisions']);
    expect(JSON.parse(request.mock.calls[2][1]!.body as string)).toEqual({ document: draft() });
  });

  it('updates an existing product without recreating it on repeated saves', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: {} }, { status: 201 }));
    await saveStudioDraft({ slug: 'existing', orgId: 'my-org', document: draft() }, request);
    await saveStudioDraft({ slug: 'existing', orgId: 'my-org', document: { ...draft(), title: 'New title' } }, request);
    expect(request.mock.calls.map(([url]) => url)).toEqual(['/api/v1/products/existing/revisions', '/api/v1/products/existing/revisions']);
  });

  it.each([401, 403, 500])('does not fall through on revision status %s', async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: 'Denied' }, { status }));
    await expect(saveStudioDraft({ slug: 'other-product', orgId: 'my-org', document: draft() }, request)).rejects.toThrow('Denied');
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not continue after product creation fails', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ error: 'Forbidden' }, { status: 403 }));
    await expect(saveStudioDraft({ slug: 'new-product', orgId: 'other-org', document: draft() }, request)).rejects.toThrow('Forbidden');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid drafts before any network write', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(saveStudioDraft({ slug: 'new-product', orgId: 'my-org', document: {} }, request)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('optional widget lifecycle', () => {
  it('cancels a delayed import without constructing a widget after unmount', async () => {
    const construct = vi.fn();
    class Widget { constructor() { construct(); } registerTool = vi.fn(); destroy = vi.fn(); }
    let resolve!: (module: { default: typeof Widget }) => void;
    const load = () => new Promise<{ default: typeof Widget }>((done) => { resolve = done; });
    const ready = vi.fn();
    const stop = connectStudioTools(toolHarness().state, ready, vi.fn(), load);
    stop();
    resolve({ default: Widget });
    await vi.waitFor(() => expect(construct).not.toHaveBeenCalled());
    expect(construct).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
  });

  it('destroys the widget and disables callbacks on cleanup', async () => {
    const callbacks = new Map<string, (args: unknown) => unknown>();
    const destroy = vi.fn();
    class Widget { registerTool: StudioToolRegistry['registerTool'] = (name, _description, _schema, callback) => { callbacks.set(name, callback); }; destroy = destroy; }
    const h = toolHarness();
    const stop = connectStudioTools(h.state, vi.fn(), vi.fn(), async () => ({ default: Widget }));
    await vi.waitFor(() => expect(callbacks.size).toBe(5));
    stop();
    stop();
    expect(destroy).toHaveBeenCalledOnce();
    expect(callbacks.get('studio_preview_draft')!({})).toMatchObject({ isError: true });
    expect(h.preview).not.toHaveBeenCalled();
  });
});
