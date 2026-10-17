/**
 * Section blocks: the larger building blocks of a blog post. Each entry pairs a strict zod props
 * schema with catalogue metadata and a valid example (tests assert every example parses).
 */
import { z } from "zod";
import { altText, button, embedUrl, href, imageSrc, markdown, optText, text } from "./block-fields";
import type { BlockSpec } from "./block-types";

const hero = z
  .object({
    eyebrow: optText(80),
    lead: text(600),
    image: z.object({ src: imageSrc, alt: altText, caption: optText(300) }).strict().optional(),
  })
  .strict();

const richText = z.object({ markdown: markdown(20000) }).strict();

const callout = z
  .object({
    tone: z.enum(["note", "tip", "warning", "success", "danger"]).optional(),
    title: optText(100),
    body: markdown(2000),
  })
  .strict();

const quote = z
  .object({ text: text(1000), attribution: optText(120), role: optText(120), sourceUrl: href.optional() })
  .strict();

const image = z
  .object({
    src: imageSrc,
    alt: altText,
    caption: optText(300),
    width: z.enum(["prose", "wide", "full"]).optional(),
    pixelWidth: z.number().int().min(1).max(8000).optional(),
    pixelHeight: z.number().int().min(1).max(8000).optional(),
  })
  .strict();

const gallery = z
  .object({
    images: z.array(z.object({ src: imageSrc, alt: altText, caption: optText(200) }).strict()).min(2).max(12),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    caption: optText(300),
  })
  .strict();

const video = z.object({ url: embedUrl, title: text(160), caption: optText(300) }).strict();

const code = z
  .object({
    code: z.string().min(1).max(20000),
    language: z.string().regex(/^[a-z0-9+#.-]{1,24}$/, "Use a short lowercase language id, e.g. ts, bash, json.").optional(),
    filename: optText(120),
    caption: optText(300),
  })
  .strict();

const cta = z
  .object({ title: text(120), body: optText(400), primary: button, secondary: button.optional() })
  .strict();

const faq = z
  .object({
    title: optText(120),
    items: z.array(z.object({ question: text(200), answer: markdown(4000) }).strict()).min(1).max(20),
  })
  .strict();

const keyTakeaways = z
  .object({ title: optText(80), items: z.array(text(300)).min(1).max(10) })
  .strict();

const table = z
  .object({
    caption: optText(200),
    headers: z.array(text(120)).min(1).max(8),
    rows: z.array(z.array(z.string().trim().max(500))).min(1).max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.rows.forEach((row, i) => {
      if (row.length !== value.headers.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rows", i], message: `Row has ${row.length} cells; expected ${value.headers.length} (one per header).` });
      }
    });
  });

const productCard = z
  .object({
    name: text(80),
    tagline: text(200),
    href,
    logo: imageSrc.optional(),
    image: imageSrc.optional(),
    tags: z.array(text(32)).max(6).optional(),
    maker: optText(80),
  })
  .strict();

const productCards = z
  .object({ title: optText(120), items: z.array(productCard).min(1).max(6) })
  .strict();

export const SECTION_BLOCKS = {
  hero: {
    title: "Hero / lead",
    description: "Opening lead paragraph with an optional eyebrow and cover image. Use at most once, as the first block; the post title is the page h1.",
    schema: hero,
    example: { eyebrow: "Build log", lead: "How we shipped a moderated product directory on Cloudflare Workers in six weeks." },
  },
  "rich-text": {
    title: "Rich text",
    description: "Markdown prose: ## headings, lists, quotes, fenced code, **bold**, *italic*, `code`, links and https images. Raw HTML is shown as text, never rendered.",
    schema: richText,
    example: { markdown: "## Why D1\n\nWe wanted **one database** close to the Worker.\n\n- No connection pool\n- Atomic batches\n\nRead the [API docs](/api-docs)." },
  },
  callout: {
    title: "Callout",
    description: "Boxed aside with a tone (note, tip, warning, success, danger). `body` is Markdown.",
    schema: callout,
    example: { tone: "tip", title: "Good to know", body: "Every write keeps a **revision**, so you can restore any earlier version." },
  },
  quote: {
    title: "Quote",
    description: "Pull quote with optional attribution, role and source link.",
    schema: quote,
    example: { text: "Ship small, ship often, and keep the receipts.", attribution: "Duy Nguyen", role: "Founder, Next Level Builders" },
  },
  image: {
    title: "Image",
    description: "One image with alt text and optional caption. `src` must be https:// or a site /images/ or /media/ path.",
    schema: image,
    example: { src: "/media/blog/example.webp", alt: "Directory dashboard in dark mode", caption: "The builder dashboard", width: "wide" },
  },
  gallery: {
    title: "Gallery",
    description: "Grid of 2-12 images with alt text and optional captions.",
    schema: gallery,
    example: {
      images: [
        { src: "/media/blog/one.webp", alt: "Submission form" },
        { src: "/media/blog/two.webp", alt: "Review queue" },
      ],
      columns: 2,
    },
  },
  video: {
    title: "Video",
    description: "Embedded video player. Only YouTube, Vimeo, Cloudflare Stream and Loom URLs are accepted.",
    schema: video,
    example: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Product walkthrough", caption: "A five-minute tour" },
  },
  code: {
    title: "Code",
    description: "Code sample shown verbatim (escaped, never executed) with optional language, filename and caption.",
    schema: code,
    example: { code: "npx nlb blog list --status draft", language: "bash", filename: "terminal" },
  },
  cta: {
    title: "Call to action",
    description: "Highlighted band with a title, short body and one or two buttons.",
    schema: cta,
    example: { title: "List your product", body: "Get a human-reviewed listing in the directory.", primary: { label: "Build with us", href: "/build-with-us", variant: "primary" } },
  },
  faq: {
    title: "FAQ",
    description: "Question and answer list; answers are Markdown.",
    schema: faq,
    example: { title: "FAQ", items: [{ question: "Is listing free?", answer: "Yes. Reviews are done by **humans**." }] },
  },
  "key-takeaways": {
    title: "Key takeaways",
    description: "Short summary list of the main points (1-10 items, inline Markdown).",
    schema: keyTakeaways,
    example: { title: "Key takeaways", items: ["D1 batches replace interactive transactions.", "Every write stores a revision."] },
  },
  table: {
    title: "Table",
    description: "Data table with 1-8 headers and up to 50 rows; each row has one cell per header. Cells accept inline Markdown.",
    schema: table,
    example: { caption: "Plans", headers: ["Plan", "Price"], rows: [["Free", "$0"], ["Pro", "$19/mo"]] },
  },
  "product-cards": {
    title: "Product cards",
    description:
      "1-6 product plates, each one link: name, tagline, href (site path such as /products/x or https://), optional logo and 16:9 image (https:// or /images/, /media/), up to 6 tags and a maker.",
    schema: productCards,
    example: {
      title: "From the directory",
      items: [
        {
          name: "AK Render",
          tagline: "HTML pages for coding agents, compiled from a short Page Spec.",
          href: "/products/ak-render",
          logo: "/media/products/ak-render/logo.png",
          tags: ["cli", "html"],
          maker: "Duy Nguyen",
        },
      ],
    },
  },
} satisfies Record<string, BlockSpec>;
