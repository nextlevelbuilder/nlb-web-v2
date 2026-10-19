# Next Level Builders agent toolkits

> The official TypeScript contracts, CLI (`nlb`), Model Context Protocol (MCP) server and AgentSkill for **[Next Level Builders](https://nextlevelbuilder.io)**. They live in the `packages/` npm workspaces of nlb-web-v2; the old `nlb-directory-toolkits` repository is superseded.

[![npm version](https://img.shields.io/npm/v/@nextlevelbuilder/cli.svg)](https://www.npmjs.com/package/@nextlevelbuilder/cli)

---

## 📦 Packages & Architecture

```text
nlb-web-v2/
├── packages/
│   ├── contracts/       # @nextlevelbuilder/contracts: Zod schemas shared by the web app, CLI and MCP
│   ├── cli/             # @nextlevelbuilder/cli: the `nlb` binary
│   └── mcp/             # @nextlevelbuilder/mcp: MCP server (stdio and Cloudflare Workers)
├── skills/
│   └── nlb-submit/      # SKILL.md: AgentSkill for Claude Code, Cursor, Codex, OpenCode, skills.sh
└── docs/toolkits/       # CLI, MCP, contracts and architecture guides
```

| Package | Description |
|---|---|
| **`@nextlevelbuilder/contracts`** | Product document and block schemas, layout templates, the canonical SHA-256 hasher, and API wire contracts (blog, Builder League, traffic). The web app imports the same source. |
| **`@nextlevelbuilder/cli`** | The `nlb` binary: validation, preview, submissions, rankings, stats, traffic, blog management, Builder League and onboarding status. |
| **`@nextlevelbuilder/mcp`** | MCP server for local IDEs (stdio) and the hosted Worker at `https://mcp.nextlevelbuilder.io/mcp` (OAuth 2.1). |
| **`skills/nlb-submit`** | AgentSkill for repository scanning, block formatting and directory submission. |

---

## ⚡ Quickstart

### 1. Using the CLI (`nlb`)

```bash
# Validate schema and compute SHA-256 canonical hash:
npx @nextlevelbuilder/cli validate product.json

# Render terminal ASCII box preview:
npx @nextlevelbuilder/cli preview product.json

# Generate a starter template:
npx @nextlevelbuilder/cli template dev-tool --out product.json

# Submit revision to directory review queue (supports Polar checkout if slot needed):
npx @nextlevelbuilder/cli submit product.json --org <YOUR_ORG_UUID> --api-key <YOUR_API_KEY>

# View organic community rankings / leaderboard:
npx @nextlevelbuilder/cli rankings weekly

# Check live platform metrics and statistics:
npx @nextlevelbuilder/cli stats

# Query your product's NLB page traffic using the configured API key:
npx @nextlevelbuilder/cli traffic my-awesome-tool --json

# Manage blog posts (admin API key; see cli.md):
npx @nextlevelbuilder/cli blog blocks --json
npx @nextlevelbuilder/cli blog publish <postId> --version 3

# Export raw LLM-optimized Markdown for any product:
npx @nextlevelbuilder/cli get my-awesome-tool --markdown

# Check database and endpoint connectivity:
npx @nextlevelbuilder/cli doctor
```

### 2. Setting up the MCP Server

#### For Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "nlb-directory": {
      "command": "npx",
      "args": ["-y", "@nextlevelbuilder/mcp"]
    }
  }
}
```

#### For Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "nlb-directory": {
      "command": "npx",
      "args": ["-y", "@nextlevelbuilder/mcp"],
      "env": {
        "NLB_API_KEY": "nlb_live_your_key_here"
      }
    }
  }
}
```

---

## 🧩 17 Supported Block Types

Every listing in Next Level Builders is composed of modular, strongly-typed blocks with `id` and `props`:

1. **`hero`**: Main showcase with headline, subheadline, CTA, and badge.
2. **`carousel`**: Multi-slide image rotation with titles and image URLs.
3. **`mediaGallery`**: Responsive multi-column screenshot and video gallery.
4. **`quote`**: Testimonials, verified reviews, and author credentials.
5. **`grid`**: Multi-column feature highlights and capability cards (1-3 cols).
6. **`changelog`**: Version histories, release dates, and categorized change notes.
7. **`roadmap`**: Planned, in-progress, and completed development milestones.
8. **`pricing`**: Tiers with billing periods, feature lists, and popular badges.
9. **`faq`**: Accordion Q&A items.
10. **`techStack`**: Categorized technology and runtime badges.
11. **`liveDemo`**: Embedded interactive sandbox (`iframe`, `height`, `sandboxTokens`).
12. **`cta`**: High-conversion call-to-action banner.
13. **`founder`**: Founder profiles, bios, and verified social links.
14. **`verification`**: Metric and platform provenance proofs.
15. **`milestones`**: Key historical achievements with metrics.
16. **`caseStudy`**: In-depth customer story with problem, solution, and quantifiable results.
17. **`analytics`**: Real NLB product page traffic with configurable title and 7/30/90-day period. Publishing opts into public aggregate totals and daily series; detailed traffic remains organization-authorized. See [Analytics block and traffic contracts](./contracts.md).

---

## 🛠️ Development

Requires Node.js 20+ (CI uses 24). Run from the nlb-web-v2 root:

```bash
npm ci
npm run build:packages        # contracts first, then cli and mcp
npm run test:packages         # Vitest in each workspace
npm run type-check:packages
```

Run one workspace with `npm run <script> -w @nextlevelbuilder/<name>`.

---

## 📖 Documentation
- [CLI Reference](./cli.md): commands and flags
- [MCP Reference](./mcp.md): tools, protocol, OAuth and Workers deployment
- [Contracts Reference](./contracts.md): Zod schemas and layout templates
- [System Architecture](./architecture.md): core/adapter boundary and hashing

---

## 📄 License
MIT © [Next Level Builders](https://nextlevelbuilder.io). Each package ships its own `LICENSE`.

## Publishing packages

Releases are published from nlb-web-v2 by [`release-packages.yml`](../../.github/workflows/release-packages.yml); the procedure and trusted-publisher settings are in [deployment-guide.md](../deployment-guide.md#npm-packages). npm versions are immutable: if a release partly publishes, inspect the registry before retrying.
