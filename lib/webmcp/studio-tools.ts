import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { LAYOUT_TEMPLATES } from '@/packages/contracts/src/templates';
import { BlockSchema } from '@/packages/contracts/src/blocks';
import { ProductDocumentSchema, type ProductDocument } from '@/packages/contracts/src/product-document';
import { studioError, validateStudioDocument } from './studio-draft';

export interface StudioToolState {
  getDocument: () => unknown;
  replaceDocument: (document: ProductDocument) => void;
  preview: () => void;
}

export interface StudioToolRegistry {
  registerTool: (name: string, description: string, schema: Record<string, unknown>, execute: (args: unknown) => unknown) => void;
}

const emptySchema = { type: 'object', properties: {}, additionalProperties: false };
const result = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

/** Read state at call time so typing and consecutive agent edits share one live canvas. */
export function registerStudioTools(registry: StudioToolRegistry, state: StudioToolState): () => void {
  let active = true;
  const documentSchema = zodToJsonSchema(ProductDocumentSchema, { $refStrategy: 'none' });
  const register = (name: string, description: string, schema: Record<string, unknown>, execute: (args: unknown) => unknown) => {
    registry.registerTool(name, description, schema, (args) => {
      if (!active) return { ...result({ error: 'Studio connection is closed' }), isError: true };
      try { return result(execute(args)); }
      catch (error) { return { ...result({ error: studioError(error) }), isError: true }; }
    });
  };
  register('studio_inspect_draft', 'Inspect the current unsaved product document. Contains only public listing fields, never account or connection credentials.', emptySchema, () => ({ document: state.getDocument() }));
  register('studio_list_templates', 'List layout templates and blocks generated using current draft information. Template copy is a starting point to edit, not verified product claims.', emptySchema, () => {
    const document = state.getDocument() as Partial<ProductDocument>;
    const templates = LAYOUT_TEMPLATES.map(({ generateBlocks, ...template }) => ({
      ...template, blocks: generateBlocks({ title: document.title || 'Product title', tagline: document.tagline || 'Product tagline', websiteUrl: document.websiteUrl || 'https://example.com' }),
    }));
    return { templates, blockTypes: BlockSchema.options.map((schema) => schema.shape.type.value), documentSchema };
  });
  register('studio_replace_draft', 'Replace the visible draft with a complete validated ProductDocument. The input schema documents all supported blocks including Activities and Pulse; HTTP and HTTPS URLs only, maximum 100 blocks, unique block IDs. Does not save or publish.', {
    type: 'object', properties: { document: documentSchema }, required: ['document'], additionalProperties: false,
  }, (args) => {
    const input = z.object({ document: z.unknown() }).strict().parse(args);
    const document = validateStudioDocument(input.document);
    state.replaceDocument(document);
    return { updated: true, document };
  });
  register('studio_apply_template', 'Replace draft blocks with a named layout template, validating the complete document before updating the canvas. Does not save or publish.', {
    type: 'object', properties: { templateId: { type: 'string', enum: LAYOUT_TEMPLATES.map((template) => template.id) } }, required: ['templateId'], additionalProperties: false,
  }, (args) => {
    const { templateId } = z.object({ templateId: z.string() }).strict().parse(args);
    const template = LAYOUT_TEMPLATES.find((item) => item.id === templateId);
    if (!template) throw new Error('Unknown template');
    const current = validateStudioDocument(state.getDocument());
    const document = validateStudioDocument({ ...current, blocks: template.generateBlocks(current) });
    state.replaceDocument(document);
    return { updated: true, document };
  });
  register('studio_preview_draft', 'Open the live preview of the current validated draft. Saving, submitting and payment remain manual Studio actions.', emptySchema, () => {
    validateStudioDocument(state.getDocument());
    state.preview();
    return { previewOpen: true };
  });
  return () => { active = false; };
}
