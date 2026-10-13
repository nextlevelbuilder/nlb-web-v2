import type { PageLocale } from "./page-locale";

/** Build with Us strings that have no key in messages/*.json. */
export type BuildWithUsCopy = {
  searchLabel: string;
  categoryGroupLabel: string;
  windowGroupLabel: string;
  categories: Record<string, string>;
  editorsPick: string;
  editorsPickTitle: string;
  trust: string;
  launched: string;
  voteFor: (name: string, votes: number) => string;
  opensInNewTab: string;
  howToSubmitTitle: string;
  howToSubmitSubtitle: string;
  howToSubmitDesc: string;
  catalogLabel: string;
  publishedCount: (count: number) => string;
};

export const buildWithUsCopy: Record<PageLocale, BuildWithUsCopy> = {
  en: {
    searchLabel: "Search products",
    categoryGroupLabel: "Filter by category",
    windowGroupLabel: "Vote window",
    categories: {
      "AI Agents": "AI Agents",
      "Developer Tools": "Developer Tools",
      Productivity: "Productivity",
      "Cloud Infrastructure": "Cloud Infrastructure",
      Documentation: "Documentation",
    },
    editorsPick: "Editor's Pick",
    editorsPickTitle: "Editorially curated based on product quality and community relevance",
    trust: "Trust",
    launched: "Launched",
    voteFor: (name, votes) => `Upvote ${name} (${votes} ${votes === 1 ? "vote" : "votes"})`,
    opensInNewTab: "(opens in a new tab)",
    howToSubmitTitle: "How to submit",
    howToSubmitSubtitle: "Web, CLI or AI agents",
    howToSubmitDesc:
      "Choose a publishing workflow: the web Studio, the CLI package, the MCP server for AI IDEs, or the REST API.",
    catalogLabel: "Product catalog",
    publishedCount: (count) => `${count.toLocaleString("en-US")} published ${count === 1 ? "product" : "products"}`,
  },
  vi: {
    searchLabel: "Tìm sản phẩm",
    categoryGroupLabel: "Lọc theo danh mục",
    windowGroupLabel: "Khoảng thời gian bình chọn",
    categories: {
      "AI Agents": "AI Agent",
      "Developer Tools": "Công cụ lập trình",
      Productivity: "Năng suất",
      "Cloud Infrastructure": "Hạ tầng đám mây",
      Documentation: "Tài liệu",
    },
    editorsPick: "Biên tập chọn",
    editorsPickTitle: "Được biên tập viên chọn dựa trên chất lượng sản phẩm và mức độ phù hợp với cộng đồng",
    trust: "Độ tin cậy",
    launched: "Ra mắt",
    voteFor: (name, votes) => `Bình chọn cho ${name} (${votes} lượt)`,
    opensInNewTab: "(mở trong tab mới)",
    howToSubmitTitle: "Cách gửi sản phẩm",
    howToSubmitSubtitle: "Web, CLI hoặc AI agent",
    howToSubmitDesc:
      "Chọn một cách đăng: Studio trên web, gói CLI, máy chủ MCP cho AI IDE hoặc REST API.",
    catalogLabel: "Danh mục sản phẩm",
    publishedCount: (count) => `${count.toLocaleString("vi-VN")} sản phẩm đã đăng`,
  },
};
