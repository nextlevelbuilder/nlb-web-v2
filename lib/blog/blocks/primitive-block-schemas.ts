/**
 * Primitive blocks: small single-purpose pieces for composing a post by hand or by an agent.
 * There is deliberately no raw HTML block; `embed` only accepts allowlisted video providers.
 */
import { z } from "zod";
import { anchorId, buttonVariant, embedUrl, href, text } from "./block-fields";
import type { BlockSpec } from "./block-types";

const heading = z
  .object({ text: text(160), level: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(), anchor: anchorId.optional() })
  .strict();

const paragraph = z.object({ text: text(4000) }).strict();

const list = z
  .object({ style: z.enum(["bullet", "number", "check"]).optional(), items: z.array(text(500)).min(1).max(50) })
  .strict();

const divider = z.object({ label: z.string().trim().max(60).optional() }).strict();

const buttonBlock = z
  .object({ label: text(60), href, variant: buttonVariant.optional(), align: z.enum(["start", "center"]).optional() })
  .strict();

const embed = z
  .object({ url: embedUrl, title: text(160), aspect: z.enum(["16:9", "4:3", "1:1", "9:16"]).optional() })
  .strict();

export const PRIMITIVE_BLOCKS = {
  heading: {
    title: "Heading",
    description: "Section heading (level 2-4; the post title is the h1) with an optional anchor id.",
    schema: heading,
    example: { text: "What we learned", level: 2 },
  },
  paragraph: {
    title: "Paragraph",
    description: "One paragraph of inline Markdown (**bold**, *italic*, `code`, links).",
    schema: paragraph,
    example: { text: "Revisions make edits **safe**: restore any version from the [API](/api-docs)." },
  },
  list: {
    title: "List",
    description: "Bullet, numbered or checklist items (inline Markdown each).",
    schema: list,
    example: { style: "check", items: ["Create a draft", "Publish when ready"] },
  },
  divider: {
    title: "Divider",
    description: "Horizontal rule, optionally with a centred label.",
    schema: divider,
    example: { label: "Part two" },
  },
  button: {
    title: "Button",
    description: "A single link button.",
    schema: buttonBlock,
    example: { label: "Read the API docs", href: "/api-docs", variant: "secondary", align: "start" },
  },
  embed: {
    title: "Embed",
    description: "Inline video embed with a chosen aspect ratio. Only YouTube, Vimeo, Cloudflare Stream and Loom URLs are accepted.",
    schema: embed,
    example: { url: "https://www.loom.com/share/0123456789abcdef0123456789abcdef", title: "Loom walkthrough", aspect: "16:9" },
  },
} satisfies Record<string, BlockSpec>;
