import type { Block } from "./blocks";

export interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  badge: string;
  generateBlocks: (meta: { title: string; tagline: string; websiteUrl: string; screenshotUrl?: string }) => Block[];
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: "saas-launch",
    name: "SaaS Launch Template",
    description: "Standard high-conversion layout for software products, micro-SaaS, and web platforms.",
    badge: "Most Popular",
    generateBlocks: (meta) => [
      {
        id: "hero-1",
        type: "hero",
        props: {
          headline: meta.title,
          subheadline: meta.tagline,
          primaryCtaText: "Get Started",
          primaryCtaUrl: meta.websiteUrl,
          badge: "Verified Launch"
        }
      },
      ...(meta.screenshotUrl ? [{
        id: "media-1",
        type: "mediaGallery" as const,
        props: {
          images: [{ url: meta.screenshotUrl, aspectRatio: "16:9" as const, caption: `${meta.title} Official Dashboard Preview` }]
        }
      }] : []),
      {
        id: "grid-1",
        type: "grid",
        props: {
          columns: 3,
          items: [
            { title: "Sub-millisecond Latency", description: "Engineered for maximum edge performance and instant client responses." },
            { title: "Deterministic Security", description: "Protected by Turnstile verification and cryptographic audit hashes." },
            { title: "Frictionless Integration", description: "Connect with developer CLI tools, MCP servers, and modern SDKs." }
          ]
        }
      },
      {
        id: "tech-1",
        type: "techStack",
        props: {
          technologies: [
            { name: "TypeScript", category: "Runtime" },
            { name: "Next.js", category: "Framework" },
            { name: "Cloudflare", category: "Edge Infrastructure" },
            { name: "PostgreSQL", category: "Database" }
          ]
        }
      },
      {
        id: "faq-1",
        type: "faq",
        props: {
          items: [
            { question: `How does ${meta.title} work?`, answer: `${meta.title} provides a streamlined, high-trust developer experience.` },
            { question: "Can I integrate with my existing workflow?", answer: "Yes, standard APIs and CLI tools are provided out of the box." }
          ]
        }
      },
      {
        id: "cta-1",
        type: "cta",
        props: {
          title: `Start Building with ${meta.title}`,
          subtitle: "Join hundreds of builders accelerating their product development today.",
          buttonText: "Launch Now",
          buttonUrl: meta.websiteUrl
        }
      }
    ]
  },
  {
    id: "ai-agent",
    name: "AI Tool & Autonomous Agent Template",
    description: "Designed for LLM applications, AI agents, cognitive memory layers, and MCP toolkits.",
    badge: "AI Native",
    generateBlocks: (meta) => [
      {
        id: "hero-1",
        type: "hero",
        props: {
          headline: `${meta.title} - Autonomous Intelligence`,
          subheadline: meta.tagline,
          primaryCtaText: "Deploy Agent",
          primaryCtaUrl: meta.websiteUrl,
          badge: "AI Agent Framework"
        }
      },
      ...(meta.screenshotUrl ? [{
        id: "media-1",
        type: "mediaGallery" as const,
        props: {
          images: [{ url: meta.screenshotUrl, aspectRatio: "16:9" as const, caption: `${meta.title} Agent Runtime Console` }]
        }
      }] : []),
      {
        id: "grid-1",
        type: "grid",
        props: {
          columns: 3,
          items: [
            { title: "Continuous Reasoning", description: "Multi-model reasoning protocols with autonomous verification loops." },
            { title: "Long-Term Memory", description: "Episodic and semantic memory that survives session resets." },
            { title: "Model Context Protocol", description: "Full MCP server integration for Cursor, Claude Code, and Codex." }
          ]
        }
      },
      {
        id: "milestones-1",
        type: "milestones",
        props: {
          items: [
            { title: "v1.0 Architecture Released", date: "2026-08", description: "Core autonomous execution protocol finalized." },
            { title: "10,000+ Agent Tasks Executed", date: "2026-09", description: "High-throughput production milestone reached." }
          ]
        }
      },
      {
        id: "cta-1",
        type: "cta",
        props: {
          title: `Supercharge Your AI Stack with ${meta.title}`,
          subtitle: "Connect your autonomous agents to production-grade intelligence.",
          buttonText: "Explore Agent",
          buttonUrl: meta.websiteUrl
        }
      }
    ]
  },
  {
    id: "dev-tool",
    name: "Developer Framework & CLI Template",
    description: "Tailored for command-line tools, backend engines, npm packages, and infrastructure frameworks.",
    badge: "Developer First",
    generateBlocks: (meta) => [
      {
        id: "hero-1",
        type: "hero",
        props: {
          headline: `${meta.title} — Built for High-Impact Engineers`,
          subheadline: meta.tagline,
          primaryCtaText: "Install Package",
          primaryCtaUrl: meta.websiteUrl,
          badge: "Open Source / CLI"
        }
      },
      {
        id: "tech-1",
        type: "techStack",
        props: {
          technologies: [
            { name: "Node.js", category: "Engine" },
            { name: "Commander.js", category: "CLI" },
            { name: "Zod", category: "Schema Validation" }
          ]
        }
      },
      {
        id: "grid-1",
        type: "grid",
        props: {
          columns: 2,
          items: [
            { title: "Zero Configuration Required", description: "Sane defaults with declarative config overrides when needed." },
            { title: "CI/CD Automation", description: "Seamless execution in GitHub Actions, GitLab CI, and Docker." }
          ]
        }
      },
      {
        id: "changelog-1",
        type: "changelog",
        props: {
          entries: [
            {
              version: "1.0.0",
              date: "2026-09-02",
              changes: [
                "Initial stable release with full CLI suite",
                "Cryptographic SHA-256 validation"
              ]
            }
          ]
        }
      },
      {
        id: "cta-1",
        type: "cta",
        props: {
          title: `Start Building with ${meta.title}`,
          subtitle: "Read the complete developer documentation and get started in seconds.",
          buttonText: "Read Docs",
          buttonUrl: meta.websiteUrl
        }
      }
    ]
  },
  {
    id: "community-curated",
    name: "Curated Directory / Community Template",
    description: "Ideal for curated catalogs, founder collectives, community directories, and knowledge wikis.",
    badge: "Community Hub",
    generateBlocks: (meta) => [
      {
        id: "hero-1",
        type: "hero",
        props: {
          headline: meta.title,
          subheadline: meta.tagline,
          primaryCtaText: "Join Community",
          primaryCtaUrl: meta.websiteUrl,
          badge: "Verified Community"
        }
      },
      {
        id: "founder-1",
        type: "founder",
        props: {
          name: "Next Level Builders Board",
          bio: "Empowering indie hackers, solopreneurs, and engineers to ship verifiable products with transparent distribution.",
          xHandle: "nextlevelbuilders"
        }
      },
      {
        id: "grid-1",
        type: "grid",
        props: {
          columns: 3,
          items: [
            { title: "Peer Reviewed", description: "Every submission is vetted by experienced builders." },
            { title: "Public Metrics", description: "Transparent community voting and organic rank snapshots." },
            { title: "Zero Pay-to-Rank", description: "Integrity-first platform without sponsored placement bias." }
          ]
        }
      },
      {
        id: "cta-1",
        type: "cta",
        props: {
          title: `Join ${meta.title} Today`,
          subtitle: "Connect with fellow builders and accelerate your journey.",
          buttonText: "Visit Hub",
          buttonUrl: meta.websiteUrl
        }
      }
    ]
  },
  {
    id: "minimalist",
    name: "Minimalist High-Impact Showcase",
    description: "Compact single-fold layout highlighting essential product screenshots, core metrics, and primary CTA.",
    badge: "Minimalist",
    generateBlocks: (meta) => [
      {
        id: "hero-1",
        type: "hero",
        props: {
          headline: meta.title,
          subheadline: meta.tagline,
          primaryCtaText: "Visit Website",
          primaryCtaUrl: meta.websiteUrl
        }
      },
      ...(meta.screenshotUrl ? [{
        id: "media-1",
        type: "mediaGallery" as const,
        props: {
          images: [{ url: meta.screenshotUrl, aspectRatio: "16:9" as const, caption: `${meta.title} Showcase Screenshot` }]
        }
      }] : []),
      {
        id: "cta-1",
        type: "cta",
        props: {
          title: `Discover ${meta.title}`,
          subtitle: "Visit the live application.",
          buttonText: "Open App",
          buttonUrl: meta.websiteUrl
        }
      }
    ]
  }
];
