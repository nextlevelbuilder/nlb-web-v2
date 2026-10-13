/**
 * The blog block registry (isomorphic). One catalogue maps each block `type` to its zod props schema,
 * JSON Schema, title, description, category and a valid example. The REST API, OpenAPI document,
 * MCP/CLI clients (via GET /api/v1/blog/blocks) and the React renderers in components/blog all read
 * this catalogue, so a block is supported everywhere or nowhere. components/blog/blog-block-renderers.tsx
 * maps every BlogBlockType to a renderer with an exhaustive type, so adding a block here without a
 * renderer fails type-checking.
 */
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { BlockCategory, BlockIssue, BlockSpec, BlogBlock, BlogBlockDefinition } from "./block-types";
import { PRIMITIVE_BLOCKS } from "./primitive-block-schemas";
import { SECTION_BLOCKS } from "./section-block-schemas";

export type { BlockIssue, BlogBlock, BlogBlockDefinition } from "./block-types";

const ALL_BLOCKS = { ...SECTION_BLOCKS, ...PRIMITIVE_BLOCKS };

export type BlogBlockType = keyof typeof ALL_BLOCKS;
export type BlogBlockProps<T extends BlogBlockType> = z.infer<(typeof ALL_BLOCKS)[T]["schema"]>;

export const MAX_BLOCKS = 60;
/** Serialized (UTF-8 JSON) size limit for a post's blocks array: 200 KB. */
export const MAX_BLOCKS_BYTES = 200 * 1024;
const BLOCK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ENVELOPE_KEYS = new Set(["type", "props", "id"]);

interface RegistryEntry extends BlockSpec {
  type: BlogBlockType;
  category: BlockCategory;
}

const ENTRIES: readonly RegistryEntry[] = [
  ...Object.entries(SECTION_BLOCKS).map(([type, spec]) => ({ ...spec, type: type as BlogBlockType, category: "section" as const })),
  ...Object.entries(PRIMITIVE_BLOCKS).map(([type, spec]) => ({ ...spec, type: type as BlogBlockType, category: "primitive" as const })),
];
const BY_TYPE = new Map<string, RegistryEntry>(ENTRIES.map((entry) => [entry.type, entry]));

export const BLOG_BLOCK_TYPES: readonly BlogBlockType[] = ENTRIES.map((entry) => entry.type);

export function isBlogBlockType(type: unknown): type is BlogBlockType {
  return typeof type === "string" && BY_TYPE.has(type);
}

export function getBlockSchema(type: BlogBlockType): z.ZodTypeAny {
  return ALL_BLOCKS[type].schema;
}

/** JSON Schema of one block's props, derived from the runtime zod schema. */
export function blockPropsJsonSchema(type: BlogBlockType): object {
  const schema: Record<string, unknown> = { ...zodToJsonSchema(getBlockSchema(type), { $refStrategy: "none", target: "jsonSchema7" }) };
  delete schema.$schema;
  return schema;
}

let definitionsCache: BlogBlockDefinition[] | null = null;

/** The full catalogue as served to API, CLI and MCP clients. Computed once per isolate. */
export function listBlockDefinitions(): BlogBlockDefinition[] {
  definitionsCache ??= ENTRIES.map((entry) => ({
    type: entry.type,
    title: entry.title,
    description: entry.description,
    category: entry.category,
    propsSchema: blockPropsJsonSchema(entry.type),
    example: { type: entry.type, props: entry.example },
  }));
  return definitionsCache;
}

export function serializedBlocksBytes(blocks: unknown): number {
  return new TextEncoder().encode(JSON.stringify(blocks) ?? "").length;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function issuesFrom(error: z.ZodError, prefix: string): BlockIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, ...issue.path.map(String)].join("."), message: issue.message }));
}

export type BlockValidationResult =
  | { ok: true; blocks: BlogBlock[] }
  | { ok: false; issues: BlockIssue[]; tooLarge: boolean };

/**
 * Validates a whole blocks array: envelope shape, known types, props per schema, unique ids,
 * post-level rules (hero only once and first) and the count/size limits.
 * `tooLarge` lets write endpoints answer 413 instead of 400 for the size limit.
 */
export function validateBlocks(input: unknown): BlockValidationResult {
  if (!Array.isArray(input)) return { ok: false, tooLarge: false, issues: [{ path: "blocks", message: "Expected an array of blocks." }] };
  if (serializedBlocksBytes(input) > MAX_BLOCKS_BYTES) {
    return { ok: false, tooLarge: true, issues: [{ path: "blocks", message: `Blocks are larger than ${MAX_BLOCKS_BYTES / 1024} KB when serialized.` }] };
  }
  if (input.length > MAX_BLOCKS) return { ok: false, tooLarge: false, issues: [{ path: "blocks", message: `At most ${MAX_BLOCKS} blocks per post.` }] };

  const issues: BlockIssue[] = [];
  const blocks: BlogBlock[] = [];
  const seenIds = new Set<string>();
  input.forEach((raw, index) => {
    const at = `blocks.${index}`;
    if (!isRecord(raw)) return void issues.push({ path: at, message: "Expected { type, props, id? }." });
    const extra = Object.keys(raw).filter((key) => !ENVELOPE_KEYS.has(key));
    if (extra.length) issues.push({ path: at, message: `Unknown key(s): ${extra.join(", ")}.` });
    if (raw.id !== undefined) {
      if (typeof raw.id !== "string" || !BLOCK_ID_RE.test(raw.id)) issues.push({ path: `${at}.id`, message: "Block id must be 1-64 letters, digits, '-' or '_'." });
      else if (seenIds.has(raw.id)) issues.push({ path: `${at}.id`, message: `Duplicate block id "${raw.id}".` });
      else seenIds.add(raw.id);
    }
    if (!isBlogBlockType(raw.type)) {
      return void issues.push({ path: `${at}.type`, message: `Unknown block type "${String(raw.type)}". Known: ${BLOG_BLOCK_TYPES.join(", ")}.` });
    }
    if (raw.type === "hero" && index !== 0) issues.push({ path: `${at}.type`, message: "Use the hero block at most once, as the first block." });
    const props = getBlockSchema(raw.type).safeParse(raw.props ?? {});
    if (!props.success) return void issues.push(...issuesFrom(props.error, `${at}.props`));
    blocks.push({ type: raw.type, props: props.data as Record<string, unknown>, ...(typeof raw.id === "string" ? { id: raw.id } : {}) });
  });

  return issues.length ? { ok: false, tooLarge: false, issues } : { ok: true, blocks };
}
