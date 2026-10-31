/**
 * Homepage brand content: founders, products, partners and toolkit commands.
 * Source of truth: plans/reports/v2-content-harvest.json and dewee-web-v2/src/content/founders.ts.
 * UI strings live in messages/*.json; copy that belongs to a product or person lives here.
 */
import type { Locale } from "@/i18n/routing";
import { MCP_ENDPOINT } from "@/lib/discovery/agent-discovery-documents";

export type Bilingual<T = string> = Record<Locale, T>;

export function pick<T>(value: Bilingual<T>, locale: string): T {
  return locale === "vi" ? value.vi : value.en;
}

export interface FounderLink {
  /** Visible label, rendered in mono caps. */
  label: string;
  href: string;
  /** Optional visible handle shown after the label in its original case, e.g. "@goon_nguyen". */
  handle?: string;
}

export interface Founder {
  id: "duy" | "cuong" | "viet";
  name: string;
  /** Dictionary-style phonetic shown next to the name, e.g. "/zuey/". */
  pronunciation?: string;
  /** 384px square WebP derived from public/docs/assets/{id}.png. */
  avatar: string;
  role: Bilingual;
  bio: Bilingual;
  facts: Bilingual<string[]>;
  company: { name: string; url: string };
  /** Link row in display order. The company link is listed explicitly where it belongs. */
  links: FounderLink[];
}

/** Every public profile of a founder, for Person JSON-LD `sameAs`. */
export function founderSameAs(founder: Founder): string[] {
  return [...new Set(founder.links.map((link) => link.href))];
}

export const FOUNDERS: Founder[] = [
  {
    id: "duy",
    name: "Duy Nguyen",
    pronunciation: "/zuey/",
    avatar: "/img/founders/duy.webp",
    role: { en: "Co-founder · Product & engineering", vi: "Đồng sáng lập · Sản phẩm & kỹ thuật" },
    bio: {
      en: "CTO and co-founder of T.O.P Group, creator of AgentKit and Dewee, and founder of the Build in Public Vietnam community.",
      vi: "CTO, đồng sáng lập T.O.P Group; cha đẻ AgentKit và Dewee; người sáng lập cộng đồng Build in Public Việt Nam.",
    },
    facts: {
      en: ["Built 14+ SaaS products", "Creator of AgentKit & Dewee", "Build in Public VN: 65K+ members"],
      vi: ["Xây hơn 14 sản phẩm SaaS", "Cha đẻ AgentKit & Dewee", "Build in Public VN: 65K+ thành viên"],
    },
    company: { name: "T.O.P Group", url: "https://wearetopgroup.com" },
    links: [
      { label: "zuey.me", href: "https://zuey.me" },
      { label: "digitop.ai", href: "https://digitop.ai" },
      { label: "T.O.P Group", href: "https://wearetopgroup.com" },
      { label: "Facebook", href: "https://facebook.com/mrgoonie" },
      { label: "X", href: "https://x.com/goon_nguyen", handle: "@goon_nguyen" },
    ],
  },
  {
    id: "cuong",
    name: "Cuong Vo",
    avatar: "/img/founders/cuong.webp",
    role: { en: "Co-founder · Operations & growth", vi: "Đồng sáng lập · Vận hành & tăng trưởng" },
    bio: {
      en: "CEO of EGANY for 11 years, building commerce software used by more than 10,000 businesses. Knows sales automation from the shop floor up.",
      vi: "CEO EGANY suốt 11 năm, làm phần mềm thương mại cho hơn 10.000 doanh nghiệp. Hiểu tự động hoá bán hàng từ tận quầy hàng.",
    },
    facts: {
      en: ["11 years leading EGANY", "10,000+ businesses served", "Sales automation & conversion"],
      vi: ["11 năm dẫn dắt EGANY", "Phục vụ 10.000+ doanh nghiệp", "Tự động hoá bán hàng & chuyển đổi"],
    },
    company: { name: "EGANY", url: "https://egany.com" },
    links: [{ label: "EGANY", href: "https://egany.com" }, { label: "Facebook", href: "https://www.facebook.com/voquoccuong007" }],
  },
  {
    id: "viet",
    name: "Viet Tran",
    avatar: "/img/founders/viet.webp",
    role: { en: "Co-founder · Architecture", vi: "Đồng sáng lập · Kiến trúc hệ thống" },
    bio: {
      en: "Founder and solution architect of 200lab, creator of GoClaw and UI UX Pro Max. 15+ years designing high-load systems, from flash sales to Black Friday peaks of ~400k concurrent users.",
      vi: "Nhà sáng lập, kiến trúc sư giải pháp của 200lab; cha đẻ GoClaw và UI UX Pro Max. Hơn 15 năm thiết kế hệ thống tải cao, từ flash sale tới đỉnh Black Friday ~400 nghìn người dùng đồng thời.",
    },
    facts: {
      en: ["Creator of GoClaw & UI UX Pro Max", "Peak ~400k concurrent users", "Mentored 3,000+ engineers"],
      vi: ["Cha đẻ GoClaw & UI UX Pro Max", "Đỉnh ~400 nghìn người dùng đồng thời", "Đào tạo 3.000+ kỹ sư"],
    },
    company: { name: "200lab", url: "https://200lab.io" },
    links: [{ label: "200lab", href: "https://200lab.io" }, { label: "Facebook", href: "https://www.facebook.com/viettranx" }],
  },
];

export interface FlagshipProduct {
  id: "agentkit" | "dewee" | "reelcrew";
  name: string;
  url: string;
  formerly?: string;
  /** Self-hosted logo; `null` renders a typographic wordmark. */
  logo: string | null;
  tagline: Bilingual;
  description: Bilingual;
}

export const FLAGSHIP_PRODUCTS: FlagshipProduct[] = [
  {
    id: "agentkit",
    name: "AgentKit",
    url: "https://agentkit.best",
    formerly: "ClaudeKit",
    logo: "/img/ecosystem/agentkit.svg",
    tagline: {
      en: "Build your AI engineering system on a battle-tested foundation of agents, skills, and workflows.",
      // VI draft written by the content researcher (AgentKit has no official VI copy); needs review.
      vi: "Xây hệ thống kỹ sư AI của riêng bạn trên nền tảng agent, skill và workflow đã được kiểm chứng.",
    },
    description: {
      en: "108+ skills, 95+ commands and 45 subagents for Claude Code, Codex, Cursor and more.",
      // VI draft written by the content researcher; needs review.
      vi: "108+ skill, 95+ lệnh và 45 subagent cho Claude Code, Codex, Cursor và nhiều công cụ khác.",
    },
  },
  {
    id: "dewee",
    name: "dewee",
    url: "https://dewee.sh",
    formerly: "GoClaw",
    logo: "/img/ecosystem/dewee.png",
    tagline: {
      en: "AI agents for business. The hard part is ours. The future is yours.",
      vi: "AI agent cho doanh nghiệp. Phần khó để chúng tôi lo.",
    },
    description: {
      en: "dewee puts AI agents to work inside your company: in the chats your team already uses, on the models you trust, behind five layers of defence.",
      vi: "dewee đưa AI agent vào làm việc ngay trong doanh nghiệp bạn: trong những nhóm chat đội ngũ đang dùng, trên các mô hình bạn tin tưởng, sau năm lớp phòng thủ.",
    },
  },
  {
    id: "reelcrew",
    name: "ReelCrew",
    url: "https://reelcrew.io",
    logo: null,
    tagline: {
      en: "A film crew for Claude Code. You have the idea. Claude directs. ReelCrew brings the whole film crew.",
      vi: "Đoàn làm phim cho Claude Code. Bạn có ý tưởng. Claude đạo diễn. ReelCrew lo cả đoàn phim.",
    },
    description: {
      en: "Video tools and skill templates for Claude Code, running on your own computer.",
      vi: "Bộ công cụ và skill template làm video cho Claude Code, chạy ngay trên máy bạn.",
    },
  },
];

export interface TeamProduct {
  id: string;
  name: string;
  url: string;
  logo: string | null;
  tagline: Bilingual;
  /** Set when the product has a published directory listing; the row then links to that listing. */
  directorySlug?: string;
}

/** "Built by the NLB team" row. Logos are self-hosted copies (dewee.sh/img/ecosystem and each tool's own brand mark). */
export const TEAM_PRODUCTS: TeamProduct[] = [
  { id: "agentkit", name: "AgentKit", url: "https://agentkit.best", logo: "/img/ecosystem/agentkit.svg", tagline: { en: "AI engineering system", vi: "Hệ thống kỹ sư AI" } },
  { id: "dewee", name: "dewee", url: "https://dewee.sh", logo: "/img/ecosystem/dewee.png", tagline: { en: "AI agents for business", vi: "AI agent cho doanh nghiệp" } },
  { id: "reelcrew", name: "ReelCrew", url: "https://reelcrew.io", logo: null, tagline: { en: "A film crew for Claude Code", vi: "Đoàn làm phim cho Claude Code" } },
  { id: "uupm", name: "UI UX Pro Max", url: "https://uupm.cc", logo: "/img/ecosystem/uupm.svg", tagline: { en: "Design intelligence for AI agents", vi: "Trí tuệ thiết kế cho AI agent" } },
  { id: "tose", name: "TOSE", url: "https://tose.sh", logo: "/img/ecosystem/tose.png", tagline: { en: "Click. Deploy. Done.", vi: "Click. Deploy. Xong!" } },
  { id: "agentbrain", name: "AgentBrain", url: "https://agentbrain.sh", logo: "/img/ecosystem/agentbrain.svg", tagline: { en: "Enterprise AI hub & business wiki", vi: "Trung tâm AI & wiki doanh nghiệp" } },
  { id: "multix-cli", name: "multix", url: "https://multix.zuey.me", logo: "/img/ecosystem/multix-cli.webp", directorySlug: "multix-cli", tagline: { en: "Multimodal AI from the command line", vi: "AI đa phương thức ngay trên dòng lệnh" } },
  { id: "cloud-harness-mcp", name: "Cloud Harness MCP", url: "https://harness.agentkit.best", logo: "/img/ecosystem/cloud-harness-mcp.webp", directorySlug: "cloud-harness-mcp", tagline: { en: "Private cloud workspace for coding agents", vi: "Không gian làm việc đám mây riêng cho coding agent" } },
  { id: "design-studio-ai", name: "Design Studio AI", url: "https://studio.agentkit.best", logo: "/img/ecosystem/design-studio-ai.webp", directorySlug: "design-studio-ai", tagline: { en: "Agent-first design workspace", vi: "Studio thiết kế ưu tiên AI agent" } },
  { id: "ak-render", name: "AK Render", url: "https://render.agentkit.best", logo: "/img/ecosystem/ak-render.webp", directorySlug: "ak-render", tagline: { en: "HTML pages compiled from a Page Spec", vi: "Trang HTML biên dịch từ Page Spec" } },
  { id: "3dviz-pro-max", name: "3Dviz Pro Max", url: "https://3dviz.dev", logo: "/img/ecosystem/3dviz-pro-max.webp", directorySlug: "3dviz-pro-max", tagline: { en: "Ideas into explorable 3D scenes", vi: "Biến ý tưởng thành cảnh 3D để khám phá" } },
  { id: "anymd", name: "anymd", url: "https://anymd.cc", logo: "/img/ecosystem/anymd.webp", directorySlug: "anymd", tagline: { en: "The web as Markdown for AI agents", vi: "Biến web thành Markdown cho AI agent" } },
];

export interface Partner {
  id: "digitop" | "200lab" | "egany";
  name: string;
  url: string;
  /** `null` renders a typographic wordmark. `plate` puts a dark-ink logo on a paper tile. */
  logo: { src: string; width: number; height: number; plate?: boolean } | null;
  oneLiner: Bilingual;
}

export const PARTNERS: Partner[] = [
  {
    id: "digitop",
    name: "DIGITOP.AI",
    url: "https://digitop.ai",
    logo: null,
    oneLiner: {
      en: "AI-first engineering: deploys enterprise AI agent systems that automate workflows and accelerate growth.",
      // VI draft written by the content researcher (DIGITOP has no official VI copy); needs review.
      vi: "Kỹ thuật AI-first: triển khai hệ thống AI agent cho doanh nghiệp, tự động hoá quy trình và tăng tốc tăng trưởng.",
    },
  },
  {
    id: "200lab",
    name: "200LAB.IO",
    url: "https://200lab.io",
    logo: { src: "/img/partners/200lab.svg", width: 32, height: 32 },
    oneLiner: {
      en: "Level up your AI skills: from systems thinking to production agents, taught through real enterprise problems.",
      vi: "Từ tư duy hệ thống tới agent chạy trong production, học bằng chính những bài toán doanh nghiệp mà 200Lab đã triển khai.",
    },
  },
  {
    id: "egany",
    name: "EGANY.COM",
    url: "https://egany.com",
    logo: { src: "/img/partners/egany.png", width: 137, height: 32, plate: true },
    oneLiner: {
      en: "Conversion- and UX-optimized e-commerce websites on Haravan, Sapo, Shopify, LadiPage and WordPress; 10,000+ businesses served.",
      vi: "Bộ giải pháp website bán hàng tối ưu chuyển đổi và trải nghiệm người dùng trên Haravan, Sapo, Shopify, LadiPage, WordPress.",
    },
  },
];

/** Real @nextlevelbuilder/cli commands, plus the official remote MCP endpoint this site serves at /mcp. */
export const TOOLKIT_COMMANDS = {
  template: "npx @nextlevelbuilder/cli template developer-cli --out product.json",
  validate: "npx @nextlevelbuilder/cli validate product.json",
  preview: "npx @nextlevelbuilder/cli preview product.json",
  submit: "npx @nextlevelbuilder/cli submit product.json --api-key $NLB_API_KEY",
  mcp: MCP_ENDPOINT,
} as const;

export const TOOLKITS_REPO_URL = "https://github.com/nextlevelbuilder/nlb-web-v2/tree/main/packages";
export const API_DOCS_PATH = "/api-docs";

/** Proof figures from content-spec-v2 (beat 5). Labels live in messages: home.proof.s1..s4. */
export const PROOF_STATS = [
  { key: "s1", value: "500+" },
  { key: "s2", value: "14+" },
  { key: "s3", value: "$100K+" },
  { key: "s4", value: "52" },
] as const;
