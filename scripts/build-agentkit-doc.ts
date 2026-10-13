/**
 * Build + validate the AgentKit.best product document against the real
 * ProductDocumentSchema and compute its canonical content hash.
 *
 * Output: writes /tmp/agentkit-best.doc.json  ({ document, contentHash, snapshot })
 * Run:    node_modules/.bin/tsx scripts/build-agentkit-doc.ts
 *
 * Content is grounded in agentkit.best (108+ skills, 95+ commands, 45 subagents,
 * 3,800+ Discord, 4.9/5 from 349 ratings, 6-stage skill graph, harness tiers,
 * $99/$99/$149 pricing) and the 7 supplied screenshots. No payment-coupled signals.
 */
import { writeFileSync } from "fs";
import { ProductDocumentSchema, computeContentHash } from "../packages/contracts/src";

const ASSETS = "https://nextlevelbuilder.io/screenshots/agentkit";

const documentInput = {
  schemaVersion: 1 as const,
  title: "AgentKit",
  tagline:
    "Build your AI engineering system on a battle-tested foundation of agents, skills, and workflows.",
  description:
    "AgentKit is a customizable foundation for coding agents — battle-tested subagents, deterministic skills, and guarded delivery workflows you can keep, change, or replace. Instead of rebuilding context, conventions, and prompts for every project, you start from 108+ skills, 95+ commands, and 45 specialized subagents that compose into your own delivery engine. A chained Skill Graph runs the full loop — Brainstorm → Advise → Plan → Cook → Code Review → Ship — with lifecycle safety hooks that inject project rules and prompt for approval before sensitive operations. Production-native adapters cover Claude Code, Codex, and Cursor. Scaffolding, not lock-in: own and adapt every agent, skill, and workflow as your team evolves.",
  websiteUrl: "https://agentkit.best",
  logoUrl: "https://nextlevelbuilder.io/screenshots/agentkit/logo.svg",
  categorySlugs: ["ai-agents", "developer-tools"],
  tagSlugs: ["claude-code", "codex", "cursor", "skills", "subagents", "workflows"],
  blocks: [
    {
      id: "hero-1",
      type: "hero" as const,
      props: {
        headline: "AgentKit — Build Your AI Engineering System",
        subheadline:
          "Battle-tested agents, skills, and workflows so you don't build your AI development system from zero. Keep what works, change what doesn't, make it yours.",
        badge: "Editor's Pick",
        primaryCtaText: "Explore AgentKit",
        primaryCtaUrl: "https://agentkit.best",
      },
    },
    {
      id: "gallery-1",
      type: "mediaGallery" as const,
      props: {
        images: [
          { url: `${ASSETS}/01-home-hero.jpg`, caption: "Ship faster with AI dev teams — one desktop control center for your coding agents.", aspectRatio: "16:9" as const },
          { url: `${ASSETS}/02-problem.jpg`, caption: "The problem: context spirals, inconsistent output, and manual workflows across every session.", aspectRatio: "16:9" as const },
          { url: `${ASSETS}/03-solution-stats.jpg`, caption: "The solution: 108+ skills, 95+ commands, and 45 specialized subagents (17 Engineer + 28 Marketing).", aspectRatio: "16:9" as const },
          { url: `${ASSETS}/04-desktop-control-tower.jpg`, caption: "One desktop to run Claude Code and every coding agent — skills, plans, tokens, and security in one place.", aspectRatio: "16:9" as const },
          { url: `${ASSETS}/05-control-tower-window.jpg`, caption: "The whole control tower in one window — migrate skills across agents and install from any source.", aspectRatio: "16:9" as const },
          { url: `${ASSETS}/06-command-center.jpg`, caption: "Command center: monitor real performance, cut your token bill, track every plan, and catch leaks before they ship.", aspectRatio: "16:9" as const },
          { url: `${ASSETS}/07-traction.jpg`, caption: "Adopted by a growing community of builders and marketers shipping with AgentKit.", aspectRatio: "16:9" as const },
        ],
      },
    },
    {
      id: "pillars-1",
      type: "grid" as const,
      props: {
        columns: 2 as const,
        items: [
          { title: "Specialized Subagents", description: "Role-based delegation: dedicated subagents for planning, coding, review, security audits, and deployment." },
          { title: "Chained Skill Graph", description: "Skills connect into a guarded delivery loop — Brainstorm → Plan → Cook → Review → Ship — with deterministic gates." },
          { title: "Context & Safety Hooks", description: "Just-in-time guardrails: pre-tool hooks prompt for approval before sensitive operations and inject project rules." },
          { title: "Harness-Native Adapters", description: "Deep runtime integration with Claude Code, Codex, and Cursor, with native tool definitions and model routing." },
        ],
      },
    },
    {
      id: "flow-1",
      type: "grid" as const,
      props: {
        columns: 3 as const,
        items: [
          { title: "1 · Brainstorm", description: "Exhaust trade-offs, surface edge cases, and define non-goals before touching code." },
          { title: "2 · Advise", description: "Autonomous Fable-tier counsel reframes requirements, surfaces anti-patterns, and scores options." },
          { title: "3 · Plan", description: "Generates verifiable phase contracts, dependency DAGs, and interactive artifacts." },
          { title: "4 · Cook", description: "Tests-first execution, worktree isolation, and zero-breakage modularization." },
          { title: "5 · Code Review", description: "Multi-perspective quality audit, regression tests, and security scans." },
          { title: "6 · Ship", description: "Conventional commit splitting, PR verification, and CI convergence watch." },
        ],
      },
    },
    {
      id: "tech-1",
      type: "techStack" as const,
      props: {
        technologies: [
          { name: "Claude Code", category: "Production Harness" },
          { name: "Codex", category: "Production Harness" },
          { name: "Cursor", category: "Production Harness" },
          { name: "TypeScript", category: "Core Runtime" },
          { name: "Skill Graph", category: "Delivery Engine" },
          { name: "Kongming Supervisor", category: "Advisory (Fable 5)" },
        ],
      },
    },
    {
      id: "pricing-1",
      type: "pricing" as const,
      props: {
        tiers: [
          {
            name: "AgentKit Engineer",
            price: "$99",
            period: "one-time",
            features: ["60+ engineering skills, 30+ workflows", "TDD planning & execution", "Database & API development", "Evidence-based code review", "Full source ownership"],
            ctaText: "Explore Engineer",
            ctaUrl: "https://agentkit.best/engineer",
            isPopular: false,
          },
          {
            name: "AgentKit Bundle",
            price: "$149",
            period: "one-time",
            features: ["Engineer + Marketing (save $49)", "All 108+ skills & 45 subagents", "3-device Desktop App license", "Priority workflow updates", "Discord community access"],
            ctaText: "Get the Bundle",
            ctaUrl: "https://agentkit.best/engineer#pricing",
            isPopular: true,
          },
          {
            name: "AgentKit Marketing",
            price: "$99",
            period: "one-time",
            features: ["12+ MCP integrations", "Automated research & briefs", "Programmatic SEO & content pipeline", "Competitor & market intelligence", "Multi-channel copywriting agents"],
            ctaText: "Explore Marketing",
            ctaUrl: "https://agentkit.best/marketing#pricing",
            isPopular: false,
          },
        ],
      },
    },
    {
      id: "quote-1",
      type: "quote" as const,
      props: {
        quote: "I really like its structured process with specialized agents. The /plan and /cook features are very impressive.",
        author: "AgentKit builder",
        title: "From the AgentKit community",
      },
    },
    {
      id: "faq-1",
      type: "faq" as const,
      props: {
        items: [
          { question: "Is AgentKit an online course?", answer: "No. AgentKit is a battle-tested foundation of agents, skills, and workflows for coding agents — scaffolding you own and customize, not a course." },
          { question: "Which coding agents are supported?", answer: "Production-native support for Claude Code, Codex, and Cursor. Additional harnesses are in experimental preview or on the roadmap." },
          { question: "Do I keep ownership?", answer: "Yes — full source ownership. Keep what works, change what doesn't, replace or delete anything. No vendor lock-in." },
        ],
      },
    },
    {
      id: "cta-1",
      type: "cta" as const,
      props: {
        title: "Don't build your AI system from zero. Make it yours.",
        subtitle: "Start from a battle-tested foundation and adapt every agent, skill, and workflow to your team.",
        buttonText: "Get Started with AgentKit",
        buttonUrl: "https://agentkit.best",
      },
    },
  ],
};

const document = ProductDocumentSchema.parse(documentInput);
const contentHash = computeContentHash(document);

const snapshot = {
  title: document.title,
  tagline: document.tagline,
  description: document.description,
  websiteUrl: document.websiteUrl,
  logoUrl: document.logoUrl,
  categorySlugs: document.categorySlugs,
  tagSlugs: document.tagSlugs,
  blockCount: document.blocks.length,
  blockTypes: document.blocks.map((b) => b.type),
};

writeFileSync("/tmp/agentkit-best.doc.json", JSON.stringify({ document, contentHash, snapshot }, null, 2));
console.log("OK: document valid.");
console.log("contentHash:", contentHash);
console.log("blocks:", snapshot.blockCount, snapshot.blockTypes.join(", "));
console.log("tagline.len:", document.tagline.length, "description.len:", document.description.length);
