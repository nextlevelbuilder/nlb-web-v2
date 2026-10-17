# v2 Content Harvest — nextlevelbuilder.io homepage

Date: 2026-10-13 (Asia/Saigon). Machine-readable twin: `plans/reports/v2-content-harvest.json` (source of truth for copy, URLs, logos).
Sources: gh (private + public repos), live sites via curl, local nlb-web, dewee-web-v2, nlb-directory-toolkits. No secrets read or printed.

## Key findings (đọc trước)
1. **Build with Us API chỉ có 1 sản phẩm published** (AgentKit, trust 70, 0 votes). Rankings cả 3 window đều rỗng (snapshot cuối 2026-09-02). Không thể chọn 6 featured từ API.
2. Homepage cũ có `featuredProducts` hardcode điểm trust giả (AgentKit 98, GoClaw 94, AgentBrain 96, Dewee 92) trong `build-with-agentkit-section.tsx`. Không nên copy sang v2.
3. **Bios founders EN+VI đã có sẵn, chất lượng tốt** trong `dewee-web-v2/src/content/founders.ts`. nlb-web chỉ có bio EN hardcode. Nên tái dùng bản dewee.
4. **Ecosystem copy EN+VI + logo** đã có ở `dewee-web-v2/src/content/ecosystem.ts` và `https://dewee.sh/img/ecosystem/*.{svg,png}` (đều trả về 200).
5. Social links trong nlb-web không đồng nhất: X có `nextlevelbuilders` (nlb-web) và `nlb_io` (dewee); `discord.gg/nextlevelbuilder` là invite **hỏng**; LinkedIn URL sai định dạng.
6. Old hero ghi "500+ builders", AgentKit ghi "3,800+ builders on Discord", NLB Discord thực tế khoảng 794 members. Cần thống nhất con số.

## 1. AgentKit (formerly ClaudeKit)
- URL: https://agentkit.best (claudekit.cc redirect 301 sang đây). Docs: https://agentkit.best/docs. Repos `bestagentkits/agentkit` (proprietary) và `bestagentkits/ak-web` (cả hai private).
- Tagline EN: "Build your AI engineering system on a battle-tested foundation of agents, skills, and workflows."
- Tagline VI (draft, site chỉ có EN/KO): "Xây hệ thống kỹ sư AI của riêng bạn trên nền tảng agent, skill và workflow đã được kiểm chứng."
- Hero: "AI Engineering System Foundation. Keep what works. Change what doesn't. Make it yours."
- Features: 108+ skills, 95+ commands, 45 subagents; Skill Graph Brainstorm > Plan > Cook > Review > Ship; chạy trên Claude Code, Codex, Cursor, Antigravity, Pi, DeepSeek Harness; `ak` CLI + Desktop app; AK Render giảm 70-73% presentation-context guidance.
- Pricing (public): Engineer $99, Marketing $99, Bundle $149 (gồm Desktop 3 devices 1 năm), Desktop $49/yr hoặc $99/yr. Giá VND: 2.450.000 / 3.650.000. Refund 14 ngày.
- Proof: 4.9/5 (349 ratings), 3,800+ builders on Discord.
- Logo: `https://agentkit.best/agentkit/logo.svg`, icon `.../agentkit/logo-icon.svg`, OG `.../agentkit/og-image.png`. Brand pack nằm trong repo ak-web: `public/brand/agentkit-logo-pack.zip`.

## 2. dewee (formerly GoClaw)
- URL https://dewee.sh, docs https://docs.dewee.sh. Repo `nextlevelbuilder/dewee` là private (gateway Go). GoClaw vẫn tồn tại như "open-source ancestor" (CC BY-NC 4.0).
- Tagline EN: "AI agents for business. The hard part is ours. The future is yours."
- Tagline VI: "AI agent cho doanh nghiệp. Phần khó để chúng tôi lo."
- Desc EN: "dewee puts AI agents to work inside your company: in the chats your team already uses, on the models you trust, behind five layers of defence. From the team behind GoClaw."
- Desc VI: "dewee đưa AI agent vào làm việc ngay trong doanh nghiệp bạn: trong những nhóm chat đội ngũ đang dùng, trên các mô hình bạn tin tưởng, sau năm lớp phòng thủ. Từ đội ngũ làm ra GoClaw."
- Features: 8-stage pipeline, 3-tier memory, agent teams, self-evolution, multi-tenant Postgres, 20+ LLM providers, 7 channels (gồm Zalo), 5-layer security, single binary ~25MB.
- Pricing: Self-install $0 (cộng $500/năm mỗi workspace để kết nối channel); AaaS $500/năm; Dedicated on TOSE $500/năm + $99 credit; On-Prem từ $5K.
- Logo: `https://dewee.sh/brand/dewee-wordmark.svg`, icon `.../brand/dewee-icon-512.png`, OG `https://dewee.sh/og/en/index.png`.

## 3. Reelcrew
- URL https://reelcrew.io, thuộc hệ sinh thái AgentVid. Site có EN/VI, ngôn ngữ đổi qua cookie `/lang/en`.
- EN: "A film crew for Claude Code. You have the idea. Claude directs. Reelcrew brings the whole film crew." / "Video tools and skill templates for Claude Code, running on your own computer."
- VI: "Đoàn làm phim cho Claude Code. Bạn có ý tưởng. Claude đạo diễn. Reelcrew lo cả đoàn phim." / "Bộ công cụ và skill template làm video cho Claude Code, chạy ngay trên máy bạn."
- Features: 17 tools (nguồn web, giọng đọc, nhạc, SFX, ảnh, phụ đề, dựng và xuất 1080p), hơn 20 skill templates, cài bằng một lệnh, có `reelcrew doctor`.
- Pricing: PreOrder Pro 1.900.000đ (99 suất), sau đó 2.900.000đ. Site claim: 176 khách tuần đầu, 5/5 từ 84 đánh giá.
- Logo: `https://reelcrew.io/site/reelcrew-favicon.svg` (chỉ có favicon SVG, không thấy wordmark). OG `https://reelcrew.io/site/og-cover.jpg`.

## 4. Other products (old site + dewee ecosystem)
| Product | URL | Logo | Ghi chú |
|---|---|---|---|
| UI UX Pro Max | uupm.cc | dewee.sh/img/ecosystem/uupm.svg | 130K+ GitHub stars |
| Agentic Working | agenticworking.io | chỉ có og-image.png | "49+ Agentic Workflows" |
| 200Lab | 200lab.io | 200lab.io/icon.svg | cũng là partner |
| GoClaw | goclaw.sh | dewee.sh/img/ecosystem/goclaw.svg | open-source ancestor |
| TOSE | tose.sh | dewee.sh/img/ecosystem/tose.png | PaaS |
| AgentBrain, AgentWiki | agentbrain.sh, agentwiki.cc | dewee ecosystem | không có trên list cũ |

Description EN/VI cũ (`messages.products.*`) nằm nguyên văn trong JSON. nlb-web dùng lucide icons, không có logo sản phẩm trong `public/`. Screenshots có tại `nlb-web/public/screenshots/{agentkit,agentbrain,agentwiki,dewee,goclaw}.png`.

## 5. Founders
| Name | Role EN / VI | Avatar | Social |
|---|---|---|---|
| Duy Nguyen | Co-founder · Product & engineering / Đồng sáng lập · Sản phẩm & kỹ thuật | `nlb-web/public/docs/assets/duy.png`, dewee.sh/img/founders/duy.webp | x.com/goon_nguyen, facebook.com/mrgoonie |
| Cuong Vo | Co-founder · Operations & growth / Đồng sáng lập · Vận hành & tăng trưởng | `.../cuong.png`, `.../cuong.webp` | facebook.com/voquoccuong007 |
| Viet Tran | Co-founder · Architecture / Đồng sáng lập · Kiến trúc hệ thống | `.../viet.png`, `.../viet.webp` | facebook.com/viettranx |

Bio và facts EN+VI có trong JSON (lấy từ dewee founders.ts). Title cũ trên nlb-web cũng được giữ lại trong field `title_old_en`. Team header cũ: "Learn from Founders Who've Done It" / "Học hỏi từ những nhà sáng lập đã làm được".

## 6. Partners
- **DIGITOP.AI**: "AI-first engineering: deploys enterprise AI agent systems that automate workflows and accelerate growth." Không tìm thấy file logo riêng; có `digitop.ai/apple-touch-icon.png` và `og-image.png`.
- **200LAB.IO**: "Level up your AI skills: from systems thinking to production agents, taught through real enterprise problems." Logo `200lab.io/icon.svg`.
- **EGANY.COM**: "Conversion- and UX-optimized e-commerce websites on Haravan, Sapo, Shopify, LadiPage, WordPress." Logo `egany.com/wp-content/uploads/2021/02/LOGO.png`.

## 7. Toolkits (nlb-directory-toolkits, MIT)
- npm (v0.2.1 trên registry; README badge ghi 0.1.0): `@nextlevelbuilder/cli` (bin `nlb`), `@nextlevelbuilder/mcp` (bin `nlb-mcp`), `@nextlevelbuilder/contracts`.
- CLI: `npx @nextlevelbuilder/cli template developer-cli --out product.json` → `validate product.json` → `preview product.json` → `submit product.json --api-key <KEY>` → `status <slug>`.
- MCP: `{"mcpServers":{"nlb-directory":{"command":"npx","args":["-y","@nextlevelbuilder/mcp"],"env":{"NLB_API_KEY":"your_api_key_here"}}}}`. Bản rút gọn: `npx -y @nextlevelbuilder/mcp`.
- AgentSkill: `skills/nlb-submit/SKILL.md`, gọi bằng `/nlb-submit`. Repo không có lệnh install một dòng.
- API docs: https://nextlevelbuilder.io/api-docs (`/api/docs` redirect 308 sang đây). OpenAPI tại `/api/openapi.json`, có thêm `/llms.txt`. Hệ thống có 16 block types và 5 templates.

## 8. Build with Us (live API)
Public endpoints: `GET /api/v1/products?limit≤50&offset`, `/products/{slug}`, `/rankings?window=daily|weekly|monthly`, `/stats`.
Stats hôm nay: published 1, outbound clicks 4082, builders 16, votes 0. Sản phẩm duy nhất là AgentKit (logo `nextlevelbuilder.io/screenshots/agentkit/logo.svg`). Maker chỉ có orgId, public API không trả về tên.

## 9. Policies & socials
- Route policy: `/policies/{slug}` (VI mặc định), `/en/policies/{slug}`. Có 6 slug: overview, ship-policy, contributor-policy, membership-tiers, onboarding, violations (title EN/VI có trong JSON). Nội dung nằm ở `messages.policies.<slug>.sections`.
- `tc` ("Community Terms & Guidelines" / "Điều khoản & Quy chế Cộng đồng") là modal trước checkout, không phải trang riêng.
- **Thiếu**: Privacy, ToS, Refund policy, trong khi hero cũ hứa hoàn tiền 30 ngày.
- Discord: discord.com/invite/Ht4sb7Wjnx (đã verify, cùng guild với dewee.sh/discord, khoảng 794 members). X: xung đột giữa nextlevelbuilders và nlb_io. GitHub: github.com/nextlevelbuilder. Facebook: chỉ có GoClawVietNam (dewee) và trang cá nhân founders. YouTube: không tìm thấy. Email: hello@ và hi@nextlevelbuilder.io.

## 10. Page-builder reference (dewee-web-v2)
Stack: Astro 7 SSR trên Cloudflare Workers, gồm D1 (pages), R2 `MEDIA`, Durable Objects (chat), zod. Phần UI không dùng framework.
- **Registry** `src/lib/blocks/registry.ts` là catalog duy nhất, được REST, MCP, admin editor và `BlockRenderer.astro` cùng dùng. Mỗi block gồm `{type, category, render: hero|self|section|inline, description, schema(zod), example}`. Hàm `blockJsonSchema()` xuất JSON Schema, `validateBlocks()` áp giới hạn tối đa 60 blocks / 200KB và PageHero phải đứng đầu, chỉ một lần.
- **12 section blocks**: PageHero, SectionHead, FeatureGrid, Steps, Faq, Quote, CtaBand, Timeline, ProofStrip, TocIndex, LogoWall, EcosystemGrid. **7 primitives**: RichText, Image, Callout, ButtonRow, Columns, Divider, Spacer. Envelope của mỗi block là `{type, props, section?: {background, spacing, id}}`.
- **Data model** (`migrations/0001_init.sql`): bảng `pages` dùng chung cho page và post. Các cột chính: kind page|post, locale en|vi, slug, blocks JSON, body_md, seo, cover, tags, author, status, translation_key, version. Ngoài ra có `page_revisions` (snapshot), `api_keys` (lưu hash và scopes), admin_sessions, login_codes.
- **Service** `src/lib/server/pages/*`: optimistic `version` (ghi trên bản cũ trả 409), revisions và restore, slug rules.
- **REST** `src/lib/server/api/*`: một route table phục vụ cả dispatch lẫn OpenAPI. Gồm `/blocks`, `/blocks/validate`, `/pages|/posts` CRUD + publish/unpublish + revisions/restore, `/media`, `/leads`. Hỗ trợ header `Idempotency-Key`.
- **MCP** `POST /mcp` (`src/lib/server/mcp/mcp-tools.ts`): list/create/update/publish theo kind, get_page, unpublish_page, list_blocks, get_block_schema, upload_media, list_revisions, restore_revision. `tools/list` được lọc theo scope của key.
- **CLI** `cli/` (`dewee-web`): auth, pages, posts (tạo từ `.md` có front matter), media upload, `mcp` stdio bridge.
- **WebMCP** `src/components/webmcp/*`: public tools (get_page_markdown, switch_language, set_theme, open_chat) và admin tools (validate_blocks, get/fill_editor_draft).
- Auth: scopes `pages:* posts:* media:write leads:read`. Admin đăng nhập bằng email OTP hoặc CF Access, có CSRF và audit log. Có skill vận hành content: `docs/skills/dewee-web-content/SKILL.md`.
- Port sang NLB blog: phần chạy được ngay là registry + validate + pages service + REST/MCP route table + CLI. Phải đổi: nlb-web dùng Next.js/OpenNext + Drizzle, nên block components Astro phải viết lại thành React. Schema D1 dùng lại được vì nlb-web cũng chạy D1/Drizzle (theo `wrangler.jsonc` và `drizzle.config.ts`, chưa kiểm chứng sâu).

Status: DONE_WITH_CONCERNS
Summary: Đã thu thập đủ 10 hạng mục, copy EN/VI kèm logo URL đã verify nằm trong JSON. Thiếu dữ liệu ở 6 featured member products vì API live chỉ có 1 sản phẩm.

## Unresolved questions
1. Featured 6: dùng ecosystem nội bộ (AgentKit, dewee, Reelcrew, UUPM, TOSE, AgentBrain) hay đợi member submit thêm? Có giữ trust score giả không? (Đề xuất: không giữ.)
2. Handle X chính thức là `@nlb_io` hay `@nextlevelbuilders`? LinkedIn và YouTube có tồn tại không?
3. Con số cộng đồng nào được dùng trên homepage: 500+ builders, ~794 Discord, 3,800+ (AgentKit Discord) hay 65K+ (Build in Public VN)?
4. Copy VI cho AgentKit và DIGITOP là bản draft do researcher viết, cần duyệt.
5. Logo DIGITOP.AI và wordmark Reelcrew: cần lấy file gốc từ team.
6. v2 có cần trang Privacy/ToS/Refund không? Hiện chưa có trang nào.
