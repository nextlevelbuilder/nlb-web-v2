/**
 * Directory listings for six open-source tools from the NLB ecosystem.
 *
 * Every fact comes from the products' own READMEs, package manifests, LICENSE files and websites,
 * collected on 2026-10-14. No usage, revenue or vote figures are included. Media files are prepared
 * locally (see seed-ecosystem-products.ts) and uploaded to R2; this module only names them.
 */
import { FOUNDERS } from "@/lib/constants/home-content";
import type { ProductDocument } from "@/packages/contracts/src";

export type MakerId = "duy" | "viet";

export interface EcosystemMedia {
  /** File name inside the prepared asset folder, e.g. "media-1.webp". */
  file: string;
  caption: string;
}

export interface EcosystemProductSeed {
  slug: string;
  maker: MakerId;
  /** Prepared logo file (512px WebP). */
  logoFile: string;
  media: EcosystemMedia[];
  githubUrl: string;
  install: string;
  /** Builds the product document once the uploaded logo, gallery and maker avatar URLs are known. */
  document: (assets: { logo: string; avatar: string; gallery: GalleryBlock }) => ProductDocument;
}

const X_HANDLES: Record<MakerId, string | undefined> = { duy: "goon_nguyen", viet: undefined };

function founderBlock(maker: MakerId, avatar: string) {
  const founder = FOUNDERS.find((entry) => entry.id === maker);
  if (!founder) throw new Error(`Unknown maker ${maker}`);
  const xHandle = X_HANDLES[maker];
  return {
    id: "maker",
    type: "founder" as const,
    props: { name: founder.name, bio: founder.bio.en, avatarUrl: avatar, ...(xHandle ? { xHandle } : {}) },
  };
}

function openSourcePricing(githubUrl: string, features: string[]) {
  return {
    id: "pricing",
    type: "pricing" as const,
    props: { tiers: [{ name: "Open source", price: "Free", period: "MIT license", features, ctaText: "View on GitHub", ctaUrl: githubUrl, isPopular: true }] },
  };
}

export type GalleryBlock = ReturnType<typeof galleryBlock>;

/** Gallery block for a product's media; `urls` are the uploaded URLs in the same order as `media`. */
export function galleryBlock(media: EcosystemMedia[], urls: string[]) {
  if (media.length !== urls.length) throw new Error("Every gallery image needs an uploaded URL");
  return { id: "gallery", type: "mediaGallery" as const, props: { images: media.map((item, index) => ({ url: urls[index], caption: item.caption, aspectRatio: "16:9" as const })) } };
}

function features(items: Array<[string, string]>, columns: 2 | 3 = 3) {
  return { id: "features", type: "grid" as const, props: { columns, items: items.map(([title, description]) => ({ title, description })) } };
}

function stack(technologies: Array<[string, string]>) {
  return { id: "stack", type: "techStack" as const, props: { technologies: technologies.map(([name, category]) => ({ name, category })) } };
}

function faq(items: Array<[string, string]>) {
  return { id: "faq", type: "faq" as const, props: { items: items.map(([question, answer]) => ({ question, answer })) } };
}

function cta(title: string, subtitle: string, githubUrl: string) {
  return { id: "cta", type: "cta" as const, props: { title, subtitle, buttonText: "Star it on GitHub", buttonUrl: githubUrl } };
}

const HERO_BADGE = "Built by the NLB team";

export const ECOSYSTEM_PRODUCTS: EcosystemProductSeed[] = [
  {
    slug: "multix-cli",
    maker: "duy",
    logoFile: "logo.webp",
    media: [{ file: "media-1.webp", caption: "One CLI for images, video, speech, music, documents and media utilities, wired to many AI providers." }],
    githubUrl: "https://github.com/mrgoonie/multix-cli",
    install: "npm install -g @mrgoonie/multix",
    document: ({ logo, gallery, avatar }) => ({
      schemaVersion: 1,
      title: "multix",
      tagline: "Generate and analyze media from the command line with a single, provider-aware interface.",
      description:
        "multix is an AI multimodal CLI that generates images, video, speech and music, analyzes and transcribes media files, converts documents to Markdown, and optimizes media with ffmpeg and ImageMagick. It supports OpenAI, Gemini, MiniMax, OpenRouter, Leonardo.Ai, BytePlus, Cloudflare, ElevenLabs, fal.ai, Atlas Cloud, Replicate and HeyGen through one command interface. Every documentation page has a Markdown twin and an llms.txt index for AI agents.",
      websiteUrl: "https://multix.zuey.me",
      logoUrl: logo,
      categorySlugs: ["developer-tools", "media", "cli"],
      tagSlugs: ["cli", "multimodal", "image-generation", "video-generation", "text-to-speech", "ffmpeg", "markdown"],
      blocks: [
        { id: "hero", type: "hero", props: { badge: HERO_BADGE, headline: "Every media model, one command line", subheadline: "Generate images, video, speech and music, transcribe and analyze media, and convert documents to Markdown from a single provider-aware CLI built for people and AI agents.", primaryCtaText: "Read the docs", primaryCtaUrl: "https://multix.zuey.me" } },
        gallery,
        features([
          ["Generate", "Image, video, speech and music generation across 12 AI providers."],
          ["Analyze and transcribe", "Media analysis and transcription, for example Gemini analyze and transcribe, and speech to text."],
          ["Documents to Markdown", "Convert documents into clean Markdown with multix doc convert."],
          ["Optimize media", "Resize and compress with ffmpeg and ImageMagick, including a target file size."],
          ["Key rotation", "Gemini API keys rotate automatically when a rate limit is hit."],
          ["Self-checking", "multix check validates your setup and multix update upgrades in place."],
        ]),
        stack([["Node.js 20+", "Runtime"], ["TypeScript", "Language"], ["commander", "CLI"], ["zod", "Validation"], ["ffmpeg", "Media"], ["ImageMagick 7", "Media"], ["Astro Starlight", "Docs site"]]),
        openSourcePricing("https://github.com/mrgoonie/multix-cli", ["Every command and provider adapter", "Bring your own provider keys", "Markdown docs and llms.txt for agents"]),
        faq([
          ["How do I install multix?", "Run npm install -g @mrgoonie/multix (Node.js 20 or newer), then multix check to validate your setup."],
          ["Which providers does it support?", "OpenAI, Gemini, MiniMax, OpenRouter, Leonardo.Ai, BytePlus, Cloudflare, ElevenLabs, fal.ai, Atlas Cloud, Replicate and HeyGen."],
          ["Is it open source?", "Yes. multix is MIT licensed and developed in the open at github.com/mrgoonie/multix-cli."],
        ]),
        founderBlock("duy", avatar),
        cta("Give your agents a media toolbox", "Install multix and generate, analyze or convert media from one command.", "https://github.com/mrgoonie/multix-cli"),
      ],
    }),
  },
  {
    slug: "cloud-harness-mcp",
    maker: "duy",
    logoFile: "logo.webp",
    media: [
      { file: "media-1.webp", caption: "Cloud Harness MCP: a private remote coding harness for AI agents." },
      { file: "media-2.webp", caption: "Architecture: authenticated MCP gateway, TTL-bound Docker executors and an ephemeral Git helper." },
    ],
    githubUrl: "https://github.com/bestagentkits/cloud-harness-mcp",
    install: "cloud-harness-mcp --transport stdio --workspace /path/to/project",
    document: ({ logo, gallery, avatar }) => ({
      schemaVersion: 1,
      title: "Cloud Harness MCP",
      tagline: "Private remote coding harness for AI agents.",
      description:
        "Cloud Harness MCP is a remote coding harness exposed through authenticated Streamable HTTP MCP. It opens an isolated repository clone in a TTL-limited Docker executor and gives a trusted owner or operators tools for workspaces, files, code intelligence, commands, shells, sessions, tasks, Git, worktrees, skills, hooks, memory and repository-defined deployment. GitHub credentials stay out of the executor: fetch, pull and push go through an ephemeral Git helper using short-lived GitHub App tokens. It can also run over stdio against a local project folder.",
      websiteUrl: "https://harness.agentkit.best",
      logoUrl: logo,
      categorySlugs: ["mcp", "ai-agents", "developer-tools"],
      tagSlugs: ["mcp", "remote-sandbox", "docker", "coding-agent", "git", "streamable-http", "self-hosted"],
      blocks: [
        { id: "hero", type: "hero", props: { badge: HERO_BADGE, headline: "A private cloud workspace your coding agent can drive", subheadline: "Isolated, TTL-bound Docker workspaces behind authenticated MCP, with Git credentials kept out of the sandbox.", primaryCtaText: "Visit Cloud Harness", primaryCtaUrl: "https://harness.agentkit.best" } },
        gallery,
        features([
          ["Isolated workspaces", "Each repository clone runs in its own TTL-bound Docker executor."],
          ["Authenticated MCP", "Streamable HTTP MCP with managed OAuth or dashboard API keys."],
          ["Credential-free sandbox", "Fetch, pull and push go through an ephemeral helper with short-lived GitHub App tokens."],
          ["Full toolset", "Files, code intelligence, shells, sessions, tasks, worktrees and memory."],
          ["Local mode", "Run over stdio against one folder, or a registry of several folders."],
        ], 2),
        stack([["Node.js 24+", "Runtime"], ["TypeScript", "Language"], ["MCP SDK", "Protocol"], ["Express 5", "Server"], ["Docker", "Executors"], ["SQLite", "State"], ["Cloudflare Workers", "API-key gateway"], ["GitHub App", "Git access"]]),
        openSourcePricing("https://github.com/bestagentkits/cloud-harness-mcp", ["Self-host the gateway and executors", "Remote MCP or local stdio mode", "GitHub App based Git access"]),
        faq([
          ["How do I try it locally?", "Build the repository, then run cloud-harness-mcp --transport stdio --workspace /path/to/project and point your MCP client at it."],
          ["Where do GitHub credentials live?", "Outside the executor. Git operations go through an ephemeral helper that uses short-lived GitHub App tokens."],
          ["Is it open source?", "Yes, under the MIT license at github.com/bestagentkits/cloud-harness-mcp."],
        ]),
        founderBlock("duy", avatar),
        cta("Give your agent a safe place to work", "Self-host Cloud Harness MCP and connect any MCP client.", "https://github.com/bestagentkits/cloud-harness-mcp"),
      ],
    }),
  },
  {
    slug: "design-studio-ai",
    maker: "duy",
    logoFile: "logo.webp",
    media: [
      { file: "media-1.webp", caption: "Design Studio AI: an agent-first design workspace for people and AI agents." },
      { file: "media-2.webp", caption: "The workspace: every design, slide deck, document and scene in one place." },
      { file: "media-3.webp", caption: "Web editor: interfaces that people and agents edit through the same revision-checked document." },
      { file: "media-4.webp", caption: "Slides editor, with export to PowerPoint, PDF and Google Slides." },
      { file: "media-5.webp", caption: "3D scene editor with editable rigged characters and GLB/glTF export." },
    ],
    githubUrl: "https://github.com/bestagentkits/design-studio-ai",
    install: "npm install -g https://github.com/bestagentkits/design-studio-ai/releases/download/v0.4.3/bestagentkits-design-studio-ai-0.4.3.tgz",
    document: ({ logo, gallery, avatar }) => ({
      schemaVersion: 1,
      title: "Design Studio AI",
      tagline: "Open-source, agent-first design workspace for AI agents and humans.",
      description:
        "Design Studio AI is an open-source, agent-first workspace for web interfaces, slides, reports, wireframes, 3D scenes and timeline video. People and agents edit the same revision-checked document through the web UI, REST, the dsa CLI, MCP and experimental WebMCP. Generation is bring-your-own-key for text, image, speech, music and video providers. Designs export to formats including HTML, SVG, PNG, PDF, PowerPoint, MP4/WebM, GLB/glTF and Google Slides, and the studio runs on Cloudflare or Docker.",
      websiteUrl: "https://studio.agentkit.best",
      logoUrl: logo,
      categorySlugs: ["design", "ai-agents", "mcp"],
      tagSlugs: ["design", "slides", "3d", "motion", "mcp", "webmcp", "byok", "open-source"],
      blocks: [
        { id: "hero", type: "hero", props: { badge: HERO_BADGE, headline: "One canvas for you and your agents", subheadline: "Design web pages, slides, reports, wireframes, 3D scenes and timeline video in a shared, revision-checked document that people and agents edit together.", primaryCtaText: "Open the studio", primaryCtaUrl: "https://studio.agentkit.best" } },
        gallery,
        features([
          ["Many formats", "Web, slides, documents, wireframes, 3D scenes and timeline video."],
          ["Agents as co-editors", "One versioned document through the UI, REST, the dsa CLI, MCP and WebMCP."],
          ["Bring your own keys", "Text, image, speech, music and video generation with your own provider keys."],
          ["Characters in motion", "2D character motion and editable rigged 3D characters."],
          ["Export anywhere", "HTML, SVG, PNG, PDF, PPTX, MP4/WebM, React ZIP, GLB/glTF and Google Slides."],
          ["Self-hosted", "Run it on Cloudflare or Docker with SQLite."],
        ]),
        stack([["TypeScript", "Language"], ["React", "UI"], ["Vite", "Build"], ["Hono", "API"], ["three.js", "3D"], ["MCP SDK", "Agents"], ["Cloudflare Workers", "Hosting"], ["Docker", "Self-hosting"]]),
        openSourcePricing("https://github.com/bestagentkits/design-studio-ai", ["Every editor and exporter", "Bring-your-own-key generation", "Cloudflare or Docker self-hosting"]),
        faq([
          ["How do I install the CLI?", "Install the release package: npm install -g https://github.com/bestagentkits/design-studio-ai/releases/download/v0.4.3/bestagentkits-design-studio-ai-0.4.3.tgz"],
          ["Can my coding agent edit designs?", "Yes. Agents use the same document as people, through REST, the dsa CLI, MCP or the experimental WebMCP tools."],
          ["Is it open source?", "Yes, MIT licensed at github.com/bestagentkits/design-studio-ai."],
        ]),
        founderBlock("duy", avatar),
        cta("Design with your agents, not around them", "Self-host Design Studio AI or try the hosted studio.", "https://github.com/bestagentkits/design-studio-ai"),
      ],
    }),
  },
  {
    slug: "ak-render",
    maker: "duy",
    logoFile: "logo.webp",
    media: [
      { file: "media-1.webp", caption: "AK Render: HTML pages for coding agents, compiled from a short Page Spec." },
      { file: "media-2.webp", caption: "The AK Render site in light mode." },
      { file: "media-3.webp", caption: "The same page in dark mode: theming is owned by the compiler." },
      { file: "media-4.webp", caption: "A dashboard page compiled from a Page Spec." },
      { file: "media-5.webp", caption: "A plan page: one self-contained HTML file that opens offline." },
    ],
    githubUrl: "https://github.com/bestagentkits/ak-render",
    install: "npx -y @bestagentkits/render plan.yaml --out plan.html",
    document: ({ logo, gallery, avatar }) => ({
      schemaVersion: 1,
      title: "AK Render",
      tagline: "HTML pages for coding agents, compiled from a short Page Spec.",
      description:
        "AK Render is a declarative page compiler for coding agents. An agent writes a short YAML or JSON Page Spec, and ak-render compiles it into one deterministic, self-contained, interactive HTML file. The compiler owns HTML, CSS, interaction, accessibility, responsive layout, theming and fonts, and a spec cannot carry raw HTML, CSS or JavaScript. Output opens offline from disk with zero network requests, and local use needs no account or API key.",
      websiteUrl: "https://render.agentkit.best",
      logoUrl: logo,
      categorySlugs: ["developer-tools", "ai-agents", "cli"],
      tagSlugs: ["html", "compiler", "yaml", "page-spec", "offline", "deterministic", "coding-agent"],
      blocks: [
        { id: "hero", type: "hero", props: { badge: HERO_BADGE, headline: "Agents describe the page. The compiler builds it.", subheadline: "Write a short YAML or JSON Page Spec and get one deterministic, accessible, self-contained HTML file that opens offline.", primaryCtaText: "See AK Render", primaryCtaUrl: "https://render.agentkit.best" } },
        gallery,
        features([
          ["One file out", "Compiles a YAML or JSON Page Spec into a single self-contained HTML file."],
          ["Deterministic", "The same spec and compiler version produce the same bytes."],
          ["Offline by default", "Embedded fonts and no CDN requests."],
          ["90 block types", "Eight categories of blocks, plus page recipes."],
          ["Curated icons", "Lucide, Phosphor, Tabler, Pixelarticons and Codicons."],
          ["Built for agents", "CLI catalog, search, describe and validate commands."],
        ]),
        stack([["Node.js 20.11+", "Runtime"], ["TypeScript", "Language"], ["YAML", "Spec format"], ["JSON Schema (ajv)", "Validation"], ["Iconify", "Icons"], ["Playwright", "Testing"], ["axe-core", "Accessibility"]]),
        openSourcePricing("https://github.com/bestagentkits/ak-render", ["Local compiles with no account or API key", "All block types and recipes", "Offline, self-contained output"]),
        faq([
          ["How do I run it?", "npx -y @bestagentkits/render plan.yaml --out plan.html compiles a spec into one HTML file."],
          ["Can a spec inject HTML or scripts?", "No. The compiler owns HTML, CSS and interaction; a spec cannot carry raw HTML, CSS or JavaScript."],
          ["Is it open source?", "Yes, MIT licensed at github.com/bestagentkits/ak-render."],
        ]),
        founderBlock("duy", avatar),
        cta("Let your agent ship pages, not markup", "Compile your first Page Spec in one command.", "https://github.com/bestagentkits/ak-render"),
      ],
    }),
  },
  {
    slug: "3dviz-pro-max",
    maker: "viet",
    logoFile: "logo.webp",
    media: [
      { file: "media-1.webp", caption: "3Dviz Pro Max: turn an idea into a 3D scene worth exploring." },
      { file: "media-2.webp", caption: "Showcase: a village at golden hour, rendered by an agent using the skill." },
      { file: "media-3.webp", caption: "Showcase: the same village at night along a lantern-lit river." },
      { file: "media-4.webp", caption: "Showcase: a tilt-shift diorama treatment." },
      { file: "media-5.webp", caption: "Showcase: coupled gears in a studio setup." },
    ],
    githubUrl: "https://github.com/viettranx/3dviz-pro-max",
    install: "claude --plugin-dir /path/to/3dviz-pro-max",
    document: ({ logo, gallery, avatar }) => ({
      schemaVersion: 1,
      title: "3Dviz Pro Max",
      tagline: "Turn an idea into a 3D scene worth exploring.",
      description:
        "3Dviz Pro Max is an agent skill for creative 3D visualization, shipped as a Claude Code plugin and a Codex skill folder. It gives an agent a ten-step workflow, a searchable catalog of recipes and knowledge records, runnable Three.js templates and kits, and a capture helper so the agent inspects frames it actually rendered. It covers subjects from anatomy, maths and mechanisms to imagined worlds, and Blender is optional for higher-fidelity kit output.",
      websiteUrl: "https://3dviz.dev",
      logoUrl: logo,
      categorySlugs: ["3d", "ai-agents", "design"],
      tagSlugs: ["3d", "threejs", "blender", "agent-skill", "claude-code", "codex", "visualization", "gltf"],
      blocks: [
        { id: "hero", type: "hero", props: { badge: HERO_BADGE, headline: "From one idea to a 3D scene you can explore", subheadline: "An agent skill for Claude Code and Codex: a ten-step workflow, recipes, runnable Three.js kits and a capture loop that checks what was really rendered.", primaryCtaText: "Explore 3dviz.dev", primaryCtaUrl: "https://3dviz.dev" } },
        gallery,
        features([
          ["Ten-step workflow", "From intent to an honest report of what was built and observed."],
          ["Recipes and knowledge", "223 recipes and 440 knowledge records across 24 directions, per the README as of 2026-09-10."],
          ["Runnable kits", "22 kit blueprints and a Vite + Three.js scaffold with lighting and camera rigs."],
          ["Look before you claim", "A Playwright capture helper lets the agent inspect real rendered frames."],
          ["Worked examples", "37 runnable example studies."],
          ["Blender optional", "Blender 4.2+ bakes higher-tier assets when you have it."],
        ]),
        stack([["three.js", "3D engine"], ["Vite", "Scaffold"], ["TypeScript", "Language"], ["Python", "Tooling"], ["Playwright", "Frame capture"], ["Blender 4.2 LTS", "Optional baking"]]),
        openSourcePricing("https://github.com/viettranx/3dviz-pro-max", ["Claude Code plugin and Codex skill", "Recipes, kits and examples", "Optional Blender pipeline"]),
        faq([
          ["How do I use it with Claude Code?", "Clone the repository and start Claude Code with claude --plugin-dir /path/to/3dviz-pro-max, the route the README reports as tested."],
          ["Does it need Blender?", "No. Blender 4.2+ is optional and only used for higher-fidelity kit output."],
          ["Is it open source?", "Yes, MIT licensed at github.com/viettranx/3dviz-pro-max."],
        ]),
        founderBlock("viet", avatar),
        cta("Give your agent a sense of space", "Add 3Dviz Pro Max to Claude Code or Codex.", "https://github.com/viettranx/3dviz-pro-max"),
      ],
    }),
  },
  {
    slug: "anymd",
    maker: "duy",
    logoFile: "logo.webp",
    media: [{ file: "media-1.webp", caption: "anymd: the web context layer for AI agents." }],
    githubUrl: "https://github.com/digitopvn/anymd",
    install: "claude mcp add --transport http anymd https://anymd.cc/mcp",
    document: ({ logo, gallery, avatar }) => ({
      schemaVersion: 1,
      title: "anymd",
      tagline: "The web context layer for AI agents.",
      description:
        "anymd reads public web content, normalizes it into structured Markdown with YAML metadata, remembers what matters in a private searchable library, and makes it available through MCP, a REST API and a CLI. Dedicated readers handle GitHub, YouTube transcripts, Reddit, Hacker News, X posts, PDFs, Office files, spreadsheets and images. Putting anymd.cc/ in front of a public URL returns Markdown, JSON or an HTML preview. It follows robots.txt, never bypasses logins or paywalls, and deploys as one Cloudflare Worker that can be self-hosted.",
      websiteUrl: "https://anymd.cc",
      logoUrl: logo,
      categorySlugs: ["ai-agents", "mcp", "data"],
      tagSlugs: ["markdown", "web-scraping", "mcp", "rag", "search", "cloudflare-workers", "ai-context"],
      blocks: [
        { id: "hero", type: "hero", props: { badge: HERO_BADGE, headline: "Any public page, as Markdown your agent can use", subheadline: "Put anymd.cc/ in front of a URL to get Markdown, JSON or a preview, and keep what matters in a private, searchable library over MCP, REST and CLI.", primaryCtaText: "Try anymd", primaryCtaUrl: "https://anymd.cc" } },
        gallery,
        features([
          ["URL prefix", "https://anymd.cc/<url> returns Markdown, JSON or an HTML preview."],
          ["Source-aware readers", "GitHub, YouTube, Reddit, Hacker News, X, PDF, Office files and images."],
          ["Private library", "BM25, full-text, semantic (bge-m3) and hybrid search over what you saved."],
          ["Remote MCP", "read_url, search_library and get_document with OAuth 2.1 or API keys."],
          ["REST, CLI and WebMCP", "The same capabilities over a REST API, a zero-dependency CLI and WebMCP tools."],
          ["Polite by design", "Respects robots.txt and opt-outs, never bypasses logins or paywalls."],
        ]),
        stack([["TypeScript", "Language"], ["Cloudflare Workers", "Runtime"], ["D1", "Database"], ["R2", "Storage"], ["Vectorize", "Semantic search"], ["Workers AI", "Embeddings"], ["Hono", "API"]]),
        openSourcePricing("https://github.com/digitopvn/anymd", ["Self-host as one Cloudflare Worker", "MCP, REST API and CLI", "Private searchable library"]),
        faq([
          ["How do I connect it to Claude Code?", "Run claude mcp add --transport http anymd https://anymd.cc/mcp and sign in when prompted."],
          ["Will it read pages behind a login?", "No. anymd reads public content only, follows robots.txt and never bypasses logins or paywalls."],
          ["Is it open source?", "Yes, MIT licensed and published by Digitop.ai at github.com/digitopvn/anymd. The unrelated npm package named anymd is not this project."],
        ]),
        founderBlock("duy", avatar),
        cta("Give your agents clean web context", "Use the hosted anymd.cc or deploy your own Worker.", "https://github.com/digitopvn/anymd"),
      ],
    }),
  },
];
