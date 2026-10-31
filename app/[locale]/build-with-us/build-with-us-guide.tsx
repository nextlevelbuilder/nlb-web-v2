import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sparkles,
  Terminal,
  Bot,
  Globe,
  Layers,
  Code2,
  CheckCircle2,
  ArrowRight,
  BookOpen,
  Zap,
  BarChart3,
} from "lucide-react";
import Link from "next/link";

/** Section id of the guide; the old /build-with-us/instructions URL redirects to this anchor. */
export const GUIDE_ANCHOR = "guide";

/**
 * Submission and integration guide, rendered below the directory on /build-with-us
 * (English-only copy, like the former standalone instructions page).
 */
export default function BuildWithUsGuide() {
  const submissionMethods = [
    {
      id: "manual",
      title: "1. Manual Web Builder (Zero Code)",
      badge: "Beginner Friendly",
      description: "Use our interactive visual builder to construct block documents, live preview, and submit directly from your browser.",
      icon: Globe,
      steps: [
        "Visit the Builder Studio at /studio",
        "Fill in product identity (Slug, Title, Tagline, Website URL, Logo)",
        "Configure Hero, Media Gallery, Features Grid, and Tech Stack blocks; add Analytics to share public traffic totals",
        "Click 'Save Draft & Revision' to generate a verified content hash",
        "Review your live preview at /studio/products/[slug]/preview and click Submit"
      ],
      ctaText: "Open Builder Studio",
      ctaUrl: "/studio"
    },
    {
      id: "cli",
      title: "2. Developer CLI Package (@nextlevelbuilder/cli)",
      badge: "Automated & CI/CD",
      description: "Validate local JSON listings, compute canonical cryptographic content hashes, and publish directly from your terminal or deployment pipeline.",
      icon: Terminal,
      steps: [
        "Install CLI: npm install -g @nextlevelbuilder/cli",
        "Validate listing: nlb validate ./nlb.product.json",
        "Preview document: nlb preview ./nlb.product.json",
        "Submit to directory: nlb submit ./nlb.product.json --api-key YOUR_API_KEY",
        "Check status: nlb status <slug>",
        "Query your product traffic: nlb traffic <slug> --json (set NLB_API_KEY first)"
      ],
      ctaText: "View NPM Package",
      ctaUrl: "https://www.npmjs.com/package/@nextlevelbuilder/cli"
    },
    {
      id: "mcp",
      title: "3. Model Context Protocol Server (MCP)",
      badge: "AI Native (Cursor / Claude / Codex)",
      description: "Connect our official MCP server to your AI IDE or agent runtime so AI tools can draft, format, and submit products autonomously.",
      icon: Bot,
      steps: [
        "Add an HTTP MCP server with URL https://nextlevelbuilder.io/mcp",
        "Tools include list_templates, validate_listing, submit_product, get_product, get_product_markdown and get_product_traffic",
        "Prompt your AI: 'Draft a full 5-block product document for my repo and submit it to Next Level Builders directory'",
        "Remote mutations require the MCP operator-provided authorization token; REST API keys are separate. Keep secrets in your client configuration.",
        "For traffic, call get_product_traffic with slug and optional from/to UTC timestamps"
      ],
      ctaText: "Explore MCP Server",
      ctaUrl: "/api-docs"
    },
    {
      id: "webmcp",
      title: "4. WebMCP — Design with AI in Studio",
      badge: "Live Draft Editing",
      description: "Connect your MCP client to the open Studio tab using WebMCP from webmcp.dev. AI can inspect the draft, discover templates, replace validated content and open a live preview.",
      icon: Sparkles,
      steps: [
        "Configure your MCP client with: npx -y @jason.today/webmcp@0.1.13 --mcp",
        "Open /studio, enable WebMCP and ask your client to create a WebMCP token",
        "Paste the token into the connection widget in Studio",
        "Ask AI to design your page using the draft tools and actual product information",
        "Review the preview, then save or submit manually. AI draft tools do not publish or pay."
      ],
      ctaText: "Design in Studio",
      ctaUrl: "/studio"
    },
    {
      id: "api",
      title: "5. Direct REST API Endpoints",
      badge: "Full Programmatic Control",
      description: "Integrate directly with our high-throughput OpenAPI 3.1 endpoints on Cloudflare Edge.",
      icon: Code2,
      steps: [
        "POST /api/v1/products — Create product draft envelope",
        "POST /api/v1/products/{slug}/revisions — Upload block document",
        "POST /api/v1/products/{slug}/submit — Submit into moderation queue",
        "GET /api/v1/products/{slug}/markdown — LLM-optimized structured feed",
        "GET /api/v1/products/{slug}/traffic — Organization-authorized traffic totals and breakdowns"
      ],
      ctaText: "Open Interactive Scalar API Docs",
      ctaUrl: "/api-docs"
    }
  ];

  const blockCatalog = [
    { type: "activities", name: "Activities", desc: "Dated product updates, newest first. Add releases, progress notes and links; an empty feed remains empty." },
    { type: "pulse", name: "Pulse", desc: "Heartbeat-style website health monitor with saved status history, response time, sampled uptime and stale-data indicators." },
    { type: "hero", name: "Hero Block", desc: "Top headline, punchy subheadline, CTA button, and urgency badge." },
    { type: "mediaGallery", name: "Media Gallery Block", desc: "Responsive 16:9 screenshot and video showcase with captions." },
    { type: "grid", name: "Grid Block", desc: "1, 2, or 3 column cards for key capabilities, architecture, and benefits." },
    { type: "techStack", name: "Tech Stack Block", desc: "Badges highlighting TypeScript, Next.js, Cloudflare, PostgreSQL, AI models." },
    { type: "pricing", name: "Pricing Block", desc: "Tiers, billing cycles, feature checklists, and checkout links." },
    { type: "faq", name: "FAQ Block", desc: "Accordion questions and answers for technical and business queries." },
    { type: "liveDemo", name: "Live Demo Embed Block", desc: "Embedded iframe sandbox or interactive playground URL." },
    { type: "cta", name: "Call To Action Block", desc: "High-contrast conversion banner with primary action button." },
    { type: "founder", name: "Founder Story Block", desc: "Founder avatar, bio, Twitter/Discord links, and personal mission statement." },
    { type: "milestones", name: "Milestones Block", desc: "Historical chronological timeline of major product achievements." },
    { type: "roadmap", name: "Roadmap Block", desc: "Upcoming quarterly releases with status (planned, in_progress, shipped)." },
    { type: "changelog", name: "Changelog Block", desc: "Versioned release notes with semver tags and date stamps." },
    { type: "quote", name: "Quote / Testimonial Block", desc: "Social proof quotes from verified community members." },
    { type: "verification", name: "Verification Claims Block", desc: "Cryptographic proof, open-source repos, and revenue verification." },
    { type: "caseStudy", name: "Case Study Block", desc: "In-depth customer implementation story with measurable ROI metrics." },
    { type: "carousel", name: "Showcase Carousel Block", desc: "Interactive carousel slider for product gallery snapshots." },
    { type: "analytics", name: "Analytics Block", desc: "Public NLB product-page views, daily sessions, website clicks, and active visitors. Choose a title and 7, 30, or 90 days." }
  ];

  return (
    <section id={GUIDE_ANCHOR} aria-labelledby="guide-title" className="bwu-guide mt-16 border-t border-line pt-12 scroll-mt-[calc(var(--header-h)+1.5rem)]">
        <div className="max-w-5xl space-y-16 pb-section-sm">
          <header className="max-w-3xl space-y-5">
            <p className="eyebrow">
              <BookOpen aria-hidden className="h-3.5 w-3.5" />
              Developer & AI Agent Submission Guide
            </p>
            <h2 id="guide-title" className="h-display">How to Submit to Build with Us</h2>
            <p className="lede">
              Everything you need to publish your product to the Next Level Builders directory — manually via Web Studio, from CLI pipelines, or autonomously with AI Agents.
            </p>
          </header>

          <section aria-labelledby="submission-methods" className="space-y-8">
            <h3 id="submission-methods" className="h-section flex items-center gap-3 border-b border-line pb-4">
              <Zap aria-hidden className="h-5 w-5 shrink-0 text-primary" />
              5 Ways to Build and Submit Your Product
            </h3>

            <div className="grid grid-cols-1 gap-6">
              {submissionMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <Card key={method.id} className="space-y-6 p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-line text-primary">
                          <Icon className="h-6 w-6" strokeWidth={1.5} />
                        </div>
                        <div>
                          <h4 className="font-display text-step-xl text-foreground">{method.title}</h4>
                          <Badge variant="secondary" className="mt-2">
                            {method.badge}
                          </Badge>
                        </div>
                      </div>

                      <Button asChild className="shrink-0 gap-2">
                        <Link href={method.ctaUrl}>
                          {method.ctaText}
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>

                    <p className="text-step-sm leading-relaxed text-ink-2">{method.description}</p>

                    <div className="space-y-3 rounded-sm border border-line bg-canvas-deep p-5">
                      <h5 className="mono-label text-ink-3">Step by step</h5>
                      <ol className="space-y-2 text-step-sm text-foreground">
                        {method.steps.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                            <span className="min-w-0 break-words font-mono text-step-xs">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-5" aria-labelledby="agent-resources">
            <h3 id="agent-resources" className="h-section">Agent connections and readable content</h3>
            <Card className="space-y-4 p-6 text-step-sm text-ink-2">
              <p>HTTP MCP endpoint: <a className="text-primary underline underline-offset-4 break-all" href="https://nextlevelbuilder.io/mcp">https://nextlevelbuilder.io/mcp</a></p>
              <pre className="overflow-x-auto rounded-sm bg-canvas-deep p-4 text-xs"><code>{JSON.stringify({ mcpServers: { "nextlevelbuilder": { url: "https://nextlevelbuilder.io/mcp" } } }, null, 2)}</code></pre>
              <p className="text-step-sm text-ink-2">Client configuration formats differ. Select HTTP transport and use the endpoint above. Read tools are public; remote writes require the operator-provided MCP token in the Authorization header. Your nlb_live_ API key authenticates REST requests and does not replace that token.</p>
              <p>WebMCP connection setup:</p>
              <pre className="overflow-x-auto rounded-sm bg-canvas-deep p-4 text-xs"><code>{JSON.stringify({ mcpServers: { webmcp: { command: "npx", args: ["-y", "@jason.today/webmcp@0.1.13", "--mcp"] } } }, null, 2)}</code></pre>
              <p className="text-step-sm text-ink-2">Enable the connection only for a client you trust: it can read and change the draft in this tab. Disconnect when finished. Setup details: <a className="text-primary underline underline-offset-4" href="https://webmcp.dev/" target="_blank" rel="noopener noreferrer">WebMCP</a>.</p>
              <p>Append <code>.md</code> to a page URL to read its Markdown representation, including localized pages. Examples: <Link className="text-primary underline underline-offset-4" href="/build-with-us.md">/build-with-us.md</Link>, <Link className="text-primary underline underline-offset-4" href="/vi/build-with-us.md">/vi/build-with-us.md</Link> and <Link className="text-primary underline underline-offset-4" href="/api-docs.md">/api-docs.md</Link>. Private pages still require your session; unknown pages remain 404.</p>
              <nav aria-label="Machine-readable resources" className="flex flex-wrap gap-4 text-sm text-primary underline">
                <Link href="/api-docs">Interactive API docs</Link><Link href="/api/openapi.json">OpenAPI specification</Link><Link href="/llms.txt">AI index</Link><Link href="/llms-full.txt">Full AI reference</Link>
              </nav>
            </Card>
          </section>

          <section className="space-y-5" aria-labelledby="pulse-guide">
            <h3 id="pulse-guide" className="h-section">Activities and Pulse</h3>
            <p className="text-ink-2">Activities contain your dated updates and display the most recent first. Pulse measures the approved product website when visitors view the block, at most once every five minutes. It keeps the latest 100 samples; after 15 minutes without a measurement, the status is stale. Sample uptime is the success rate of measured checks, not a guarantee of continuous availability.</p>
            <pre className="overflow-x-auto rounded-sm bg-canvas-deep p-4 text-xs"><code>{JSON.stringify([{ id: "recent-activities", type: "activities", props: { title: "Recent activity", entries: [] } }, { id: "website-pulse", type: "pulse", props: { title: "Website pulse", showHistory: true } }], null, 2)}</code></pre>
            <p className="text-step-sm text-ink-2">Use GET /api/v1/products/&#123;slug&#125;/pulse to read saved history. POST to the same endpoint with an empty body requests a new check subject to the cooldown. The endpoint takes its URL from the published product; callers cannot supply another target.</p>
          </section>

          <section aria-labelledby="block-catalog" className="space-y-8 border-t border-line pt-6">
            <div>
              <h3 id="block-catalog" className="h-section flex items-center gap-3">
                <Layers aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                {blockCatalog.length} Supported Content Block Types
              </h3>
              <p className="mt-2 text-step-sm text-ink-2">
                Every listing is represented as an immutable, validated JSON document containing any combination of these {blockCatalog.length} blocks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {blockCatalog.map((b) => (
                <Card key={b.type} className="space-y-2 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-step-sm font-medium text-foreground">{b.name}</h4>
                    <code className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-step-xs text-primary">
                      {b.type}
                    </code>
                  </div>
                  <p className="text-step-xs leading-relaxed text-ink-2">{b.desc}</p>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-6 border-t border-line pt-6" aria-labelledby="product-traffic-guide">
            <h3 id="product-traffic-guide" className="h-section flex items-center gap-3">
              <BarChart3 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              Measure Your Product Page Traffic
            </h3>
            <p className="text-step-sm text-ink-2">
              Analytics measures your published page on Next Level Builders and its website clicks. Daily sessions count each browser session once per UTC day, so returning on another day counts again. Studio preview visits are not counted.
            </p>
            <Card className="space-y-4 p-6 sm:p-8">
              <h4 className="font-display text-step-lg">Share aggregate traffic with an Analytics block</h4>
              <p className="text-step-sm text-ink-2">
                Choose Analytics in Studio, or include this block in your product document through REST, CLI, or MCP. Set a title and a reporting period of 7d, 30d, or 90d. Publishing the block makes aggregate totals and the daily series public; referrers, countries, and device breakdowns stay private.
              </p>
              <pre className="p-4 rounded-sm bg-canvas-deep border border-line overflow-x-auto text-xs"><code>{JSON.stringify({ id: "product-traffic", type: "analytics", props: { title: "Traffic", period: "30d" } }, null, 2)}</code></pre>
              <p className="text-step-sm text-ink-2">Once the Analytics block is published, the public summary is available at:</p>
              <pre className="p-4 rounded-sm bg-canvas-deep border border-line overflow-x-auto text-xs"><code>{'GET /api/v1/products/{slug}/traffic/public?period=30d'}</code></pre>
            </Card>
            <Card className="space-y-4 p-6 sm:p-8">
              <h4 className="font-display text-step-lg">Query detailed traffic with your API key</h4>
              <p className="text-step-sm text-ink-2">
                Use an API key belonging to a member of the product organization; administrators also have access. Create your key in Profile. Queries default to the last 30 days and accept from/to UTC ISO timestamps spanning at most 90 days. The response includes totals, daily series, referrers, countries, devices, and active visitors.
              </p>
              <div className="space-y-2">
                <h5 className="mono-label text-ink-3">REST</h5>
                <pre className="p-4 rounded-sm bg-canvas-deep border border-line overflow-x-auto text-xs"><code>{'GET /api/v1/products/{slug}/traffic?from=2026-09-01T00:00:00Z&to=2026-09-08T00:00:00Z\nAuthorization: Bearer YOUR_API_KEY'}</code></pre>
              </div>
              <div className="space-y-2">
                <h5 className="mono-label text-ink-3">CLI</h5>
                <p className="text-step-xs text-ink-2">Set NLB_API_KEY in your environment, then run:</p>
                <pre className="p-4 rounded-sm bg-canvas-deep border border-line overflow-x-auto text-xs"><code>{'nlb traffic my-product --from 2026-09-01T00:00:00Z --to 2026-09-08T00:00:00Z --json'}</code></pre>
              </div>
              <div className="space-y-2">
                <h5 className="mono-label text-ink-3">MCP</h5>
                <p className="text-step-xs text-ink-2">With NLB_API_KEY configured for your MCP server, call get_product_traffic:</p>
                <pre className="p-4 rounded-sm bg-canvas-deep border border-line overflow-x-auto text-xs"><code>{JSON.stringify({ slug: "my-product", from: "2026-09-01T00:00:00Z", to: "2026-09-08T00:00:00Z" }, null, 2)}</code></pre>
              </div>
              <Button asChild variant="outline" className="gap-2">
                <Link href="/api/docs">Explore Traffic API<ArrowRight className="w-4 h-4" /></Link>
              </Button>
            </Card>
          </section>

          <section aria-labelledby="launch-cta" className="surface-panel space-y-6 p-8 text-center shadow-constellation sm:p-12">
            <h3 id="launch-cta" className="h-section">Ready to launch your product?</h3>
            <p className="mx-auto max-w-xl text-step-base text-ink-2">
              Every listing is reviewed by people, ranked only by transparent community votes, and never placed by payment.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <Link href="/studio">
                  Launch in Studio
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="gap-2">
                <Link href="/api-docs">
                  Read API Docs
                </Link>
              </Button>
            </div>
          </section>
        </div>
    </section>
  );
}
