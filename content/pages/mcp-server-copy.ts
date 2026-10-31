import type { PageLocale } from "./page-locale";

/** A client the page shows connection steps for; the snippet itself lives in the page. */
export type McpClientId = "claudeCode" | "claudeApp" | "configFile" | "local";

export type McpToolGroupId = "directory" | "launch" | "traffic" | "keys" | "membership" | "admin";

/** Copy of the /mcp-server page (the official MCP server introduction). */
export type McpServerCopy = {
  metaTitle: string;
  metaDescription: string;
  plate: string;
  headingLead: string;
  headingAccent: string;
  lede: string;
  endpointLabel: string;
  copyEndpoint: string;
  connectCta: string;
  toolsCta: string;
  facts: string[];
  connectTitle: string;
  connectIntro: string;
  clients: Record<McpClientId, { name: string; note: string; copyLabel: string }>;
  claudeAppSteps: string[];
  authTitle: string;
  authIntro: string;
  scopes: { scope: string; desc: string }[];
  authNotes: string[];
  manageAccess: string;
  toolsTitle: string;
  toolsIntro: string;
  toolGroups: Record<McpToolGroupId, { title: string; access: string; desc: string }>;
  promptsTitle: string;
  prompts: string[];
  resourcesTitle: string;
  resources: { serverCard: string; apiDocs: string; openApi: string; llms: string; repository: string; guide: string };
  newTab: string;
};

export const mcpServerCopy: Record<PageLocale, McpServerCopy> = {
  en: {
    metaTitle: "Official MCP server",
    metaDescription: "Connect Claude, Cursor or any MCP client to Next Level Builders at https://nextlevelbuilder.io/mcp: search the directory, submit products and read traffic, signed in with OAuth 2.1.",
    plate: "MCP server",
    headingLead: "Next Level Builders, inside your ",
    headingAccent: "AI agent.",
    lede: "One remote MCP endpoint lets Claude, Cursor and other clients search the directory, draft and submit your product, vote and read your traffic. Reads are public; anything on your account asks you to sign in with NLB.",
    endpointLabel: "MCP endpoint",
    copyEndpoint: "Copy MCP endpoint",
    connectCta: "Connect a client",
    toolsCta: "See the tools",
    facts: ["Streamable HTTP · MCP 2026-07-28", "OAuth 2.1 sign-in, no API key to copy", "Public directory reads"],
    connectTitle: "Connect in a minute",
    connectIntro: "Pick your client. Every option points at the same endpoint; the client opens your browser the first time a tool needs your account.",
    clients: {
      claudeCode: { name: "Claude Code", note: "Run once in your terminal:", copyLabel: "Copy Claude Code command" },
      claudeApp: { name: "Claude Desktop and claude.ai", note: "Add a custom connector:", copyLabel: "Copy MCP endpoint" },
      configFile: { name: "Cursor and other clients", note: "Add to mcp.json (or your client's MCP settings) and choose HTTP transport:", copyLabel: "Copy MCP configuration" },
      local: { name: "Scripts, CI and clients without OAuth", note: "Run the local stdio server with an API key from your Account:", copyLabel: "Copy local server configuration" },
    },
    claudeAppSteps: ["Open Settings → Connectors", "Choose Add custom connector", "Name it Next Level Builders and paste the endpoint", "Connect, then sign in with NLB when asked"],
    authTitle: "Sign-in and permissions",
    authIntro: "Directory reads need no account. When a tool acts for you, the client sends you to NLB to sign in and approve only the scopes it asks for (OAuth 2.1 with PKCE).",
    scopes: [
      { scope: "mcp:read", desc: "Read your account data, such as product traffic and membership status." },
      { scope: "mcp:write", desc: "Act for you: submit products, upload media, vote and start a checkout." },
      { scope: "mcp:keys", desc: "List, create and revoke your API keys." },
      { scope: "mcp:operator", desc: "Platform operators only." },
    ],
    authNotes: [
      "Access tokens last five minutes; the client renews them while you stay connected.",
      "Without OAuth, send an nlb_live_ API key as Authorization: Bearer, or set NLB_API_KEY for the local server.",
    ],
    manageAccess: "Review or disconnect apps in your Account",
    toolsTitle: "What your agent can do",
    toolsIntro: "Tools are grouped by the access they need. Your client lists them after it connects.",
    toolGroups: {
      directory: { title: "Explore the directory", access: "Public", desc: "Search and read published products, rankings and stats; validate a listing and get its canonical hash before you submit." },
      launch: { title: "Launch and take part", access: "Sign in · mcp:write", desc: "Submit a product document to review, upload media, vote for products and open a membership checkout." },
      traffic: { title: "Product traffic", access: "Sign in · mcp:read", desc: "Totals, daily series, referrers, countries and devices for products in your organization, over up to 90 days." },
      keys: { title: "API keys", access: "Sign in · mcp:keys", desc: "Manage the keys your scripts and CI use." },
      membership: { title: "Membership", access: "Sign in · mcp:read", desc: "Check your membership onboarding status." },
      admin: { title: "Blog and courses", access: "Admins only", desc: "Draft, publish and revise blog posts; upload course videos and transcripts." },
    },
    promptsTitle: "Try asking",
    prompts: [
      "Find AI agent tools in the Next Level Builders directory and compare the top three.",
      "Draft a product document for this repo with hero, features, tech stack and FAQ blocks, validate it and submit it to Next Level Builders.",
      "How much traffic did my product page get over the last 30 days, and where did it come from?",
    ],
    resourcesTitle: "For agents and developers",
    resources: {
      serverCard: "MCP server card",
      apiDocs: "REST API reference",
      openApi: "OpenAPI document",
      llms: "llms.txt",
      repository: "Source on GitHub",
      guide: "Submission guide",
    },
    newTab: "(opens in a new tab)",
  },
  vi: {
    metaTitle: "MCP server chính thức",
    metaDescription: "Kết nối Claude, Cursor hay bất kỳ MCP client nào với Next Level Builders tại https://nextlevelbuilder.io/mcp: tìm trong directory, gửi sản phẩm và xem traffic, đăng nhập bằng OAuth 2.1.",
    plate: "MCP server",
    headingLead: "Next Level Builders, ngay trong ",
    headingAccent: "AI agent.",
    lede: "Một MCP endpoint duy nhất giúp Claude, Cursor và các client khác tìm trong directory, soạn và gửi sản phẩm của bạn, bình chọn và xem traffic. Dữ liệu công khai đọc tự do; thao tác trên tài khoản sẽ yêu cầu bạn đăng nhập NLB.",
    endpointLabel: "MCP endpoint",
    copyEndpoint: "Sao chép MCP endpoint",
    connectCta: "Kết nối client",
    toolsCta: "Xem các tool",
    facts: ["Streamable HTTP · MCP 2026-07-28", "Đăng nhập OAuth 2.1, không cần chép API key", "Đọc directory công khai"],
    connectTitle: "Kết nối trong một phút",
    connectIntro: "Chọn client của bạn. Mọi cách đều dùng cùng một endpoint; lần đầu một tool cần tài khoản, client sẽ mở trình duyệt để bạn đăng nhập.",
    clients: {
      claudeCode: { name: "Claude Code", note: "Chạy một lần trong terminal:", copyLabel: "Sao chép lệnh Claude Code" },
      claudeApp: { name: "Claude Desktop và claude.ai", note: "Thêm custom connector:", copyLabel: "Sao chép MCP endpoint" },
      configFile: { name: "Cursor và các client khác", note: "Thêm vào mcp.json (hoặc phần cài đặt MCP của client) và chọn transport HTTP:", copyLabel: "Sao chép cấu hình MCP" },
      local: { name: "Script, CI và client không hỗ trợ OAuth", note: "Chạy server stdio cục bộ với API key tạo trong Tài khoản:", copyLabel: "Sao chép cấu hình server cục bộ" },
    },
    claudeAppSteps: ["Mở Settings → Connectors", "Chọn Add custom connector", "Đặt tên Next Level Builders và dán endpoint", "Bấm Connect, rồi đăng nhập NLB khi được hỏi"],
    authTitle: "Đăng nhập và quyền truy cập",
    authIntro: "Đọc directory không cần tài khoản. Khi một tool thao tác thay bạn, client sẽ chuyển bạn sang NLB để đăng nhập và chỉ cấp những scope nó yêu cầu (OAuth 2.1 với PKCE).",
    scopes: [
      { scope: "mcp:read", desc: "Đọc dữ liệu tài khoản, như traffic sản phẩm và trạng thái membership." },
      { scope: "mcp:write", desc: "Thao tác thay bạn: gửi sản phẩm, tải media, bình chọn và mở checkout." },
      { scope: "mcp:keys", desc: "Xem, tạo và thu hồi API key của bạn." },
      { scope: "mcp:operator", desc: "Chỉ dành cho người vận hành nền tảng." },
    ],
    authNotes: [
      "Access token có hiệu lực năm phút; client tự gia hạn khi bạn vẫn kết nối.",
      "Nếu không dùng OAuth, gửi API key nlb_live_ qua header Authorization: Bearer, hoặc đặt NLB_API_KEY cho server cục bộ.",
    ],
    manageAccess: "Xem hoặc ngắt kết nối ứng dụng trong Tài khoản",
    toolsTitle: "Agent của bạn làm được gì",
    toolsIntro: "Các tool được nhóm theo quyền cần có. Client sẽ liệt kê chúng sau khi kết nối.",
    toolGroups: {
      directory: { title: "Khám phá directory", access: "Công khai", desc: "Tìm và đọc sản phẩm đã xuất bản, bảng xếp hạng và thống kê; kiểm tra listing và lấy hash chuẩn trước khi gửi." },
      launch: { title: "Ra mắt và tham gia", access: "Đăng nhập · mcp:write", desc: "Gửi tài liệu sản phẩm để duyệt, tải media, bình chọn sản phẩm và mở checkout membership." },
      traffic: { title: "Traffic sản phẩm", access: "Đăng nhập · mcp:read", desc: "Tổng lượt, chuỗi theo ngày, nguồn truy cập, quốc gia và thiết bị của sản phẩm trong tổ chức của bạn, tối đa 90 ngày." },
      keys: { title: "API key", access: "Đăng nhập · mcp:keys", desc: "Quản lý key mà script và CI của bạn sử dụng." },
      membership: { title: "Membership", access: "Đăng nhập · mcp:read", desc: "Kiểm tra trạng thái onboarding membership." },
      admin: { title: "Blog và khóa học", access: "Chỉ admin", desc: "Soạn, xuất bản và chỉnh sửa bài blog; tải video khóa học và transcript." },
    },
    promptsTitle: "Thử hỏi agent",
    prompts: [
      "Tìm các công cụ AI agent trong directory Next Level Builders và so sánh ba sản phẩm đứng đầu.",
      "Soạn tài liệu sản phẩm cho repo này với các block hero, tính năng, tech stack và FAQ, kiểm tra rồi gửi lên Next Level Builders.",
      "Trang sản phẩm của tôi có bao nhiêu traffic trong 30 ngày qua, đến từ đâu?",
    ],
    resourcesTitle: "Cho agent và developer",
    resources: {
      serverCard: "MCP server card",
      apiDocs: "Tài liệu REST API",
      openApi: "Tài liệu OpenAPI",
      llms: "llms.txt",
      repository: "Mã nguồn trên GitHub",
      guide: "Hướng dẫn gửi sản phẩm",
    },
    newTab: "(mở trong tab mới)",
  },
};
