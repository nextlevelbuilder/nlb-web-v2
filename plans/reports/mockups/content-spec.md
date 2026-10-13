# Content spec — 5 homepage mockups (M0)

Shared copy for all 5 mockups so they can be compared fairly. Source: `nlb-web/messages/vi.json` + advisor report `../advisor-261013-1240-nlb-web-v2-redesign.md` §11b. Items marked (mẫu) are illustrative sample data, not real records.

## Brand
- Name: Next Level Builders (NLB). Domain: nextlevelbuilder.io
- Positioning line (hero): "Cộng đồng builder ra mắt sản phẩm thật — mỗi tuần."
- Sub: "Học từ video thực chiến hàng tuần, ra mắt trên Directory đã xác minh, và lớn lên cùng 500+ builder trong Discord. Từ 0 lên 1 luôn là phần khó nhất — bạn không phải đi một mình."
- CTA chính: "Tham gia membership" · CTA phụ: "Xem video tuần này"
- Trust row: Hoàn tiền 100% trong 30 ngày · Thanh toán an toàn qua Polar.sh · 500+ builder năng động

## Header
Logo "Next Level Builders" · nav: Courses, Directory, Bảng xếp hạng, Bảng giá, Build with us · VI/EN switch · "Đăng nhập" · button "Tham gia"

## 3 trụ cột
1. Cộng đồng — Discord riêng tư, 500+ builder, phản hồi & trách nhiệm, mạng lưới nhà sáng lập.
2. Courses — Video chia sẻ hàng tuần: AI automation, SEO, phát triển & tăng trưởng sản phẩm. Mua lẻ từng video, xem trọn đời. VIP xem toàn bộ.
3. Directory — Sản phẩm được kiểm duyệt thủ công, Trust Passport, bảng xếp hạng tự nhiên 24h UTC. Không trả tiền để lên hạng.

## Courses teaser (3 cards, mẫu)
- "Dựng agent tự động hoá bán hàng với Claude Code" · 48 phút · $19 · Tuần 41
- "SEO cho micro-SaaS: từ 0 đến 10K visit/tháng" · 36 phút · $15 · Tuần 40
- "Ra mắt trên Product Hunt & Build with Us: checklist thực chiến" · 29 phút · $12 · Tuần 39
Each card: thumbnail, week label, duration, price "Mua $19", badge "VIP xem miễn phí". Link "Xem tất cả video →".

## Directory highlight (top tuần này, mẫu)
| # | Product | Tagline | Trust | Votes |
|---|---------|---------|-------|-------|
| 1 | ClaudeKit | Skills & workflows cao cấp cho Claude Code | 96 | 412 |
| 2 | GoClaw | Nền tảng AI agent bảo mật cho doanh nghiệp | 93 | 287 |
| 3 | UI UX Pro Max | Hệ thống thiết kế UI/UX với AI | 91 | 254 |
| 4 | TOSE | Click. Deploy. Xong — production trong 2 phút | 89 | 198 |
| 5 | Agentic Working | Framework làm việc với AI agents | 87 | 163 |
Footer line: "Kiểm duyệt thủ công • Không trả tiền để lên hạng • Cloudflare Edge" · CTA "Gửi sản phẩm của bạn".

## Social proof
Stats: 500+ builder · 14+ sản phẩm SaaS sinh lợi của đội ngũ · $100K+ ARR · 52 tuần video
Testimonials (mẫu, 3): short 1–2 sentence quotes from "Minh — indie hacker", "Lan — founder micro-SaaS", "Tuấn — developer full-time".

## Pricing (toggle Quý / Năm)
- Premium — Builder tự học — 30 chỗ — $147/quý (≈$49/tháng) hoặc $39/tháng trả năm ($468/năm). Gồm: thư viện 52 tuần video + video mới hàng tuần; Discord riêng tư; kênh hỗ trợ ra mắt; phản hồi từ nhà sáng lập.
- VIP — Builder được hướng dẫn — 10 chỗ — $297/quý (≈$99/tháng) hoặc $79/tháng trả năm ($948/năm). Tất cả Premium + kênh VIP câu hỏi ưu tiên; truy cập sớm công cụ & nội dung; 1 bài viết quảng bá sản phẩm; kho template + prompt AI VIP; **xem toàn bộ Courses miễn phí**.
- Note: "Đảm bảo hoàn tiền 30 ngày · Thanh toán qua Polar.sh"

## Build with us / toolkits
Title "Ra mắt từ terminal". Snippet:
```
npx @nextlevelbuilder/cli template developer-cli --out product.json
npx @nextlevelbuilder/cli submit product.json --api-key $NLB_API_KEY
```
+ MCP: `npx -y @nextlevelbuilder/mcp` — "Hoặc kết nối MCP server vào Claude/Cursor để quản lý listing bằng ngôn ngữ tự nhiên." Link "Tài liệu API v1".

## Final CTA
"Sẵn sàng ra mắt sản phẩm tiếp theo?" · button "Tham gia membership" · "Không rủi ro trong 30 ngày · Truy cập ngay"

## Footer
Tagline "Xây dựng tương lai, từng sản phẩm một." · Links: Courses, Directory, Bảng xếp hạng, Tài liệu API, Chính sách, Discord, GitHub, X · "© 2026 Next Level Builders."

## Technical constraints (all mockups)
- Single standalone HTML file, open directly in browser. Tailwind via `https://cdn.tailwindcss.com` (or inline CSS). Google Fonts allowed. No JS framework; vanilla JS only (hamburger, pricing toggle).
- File < 200 KB. Images: CSS gradients/shapes or `https://picsum.photos/seed/<x>/...`; no assets from old repo.
- Responsive: ≥1280 desktop; 768–1024 tablet (compact nav, 2-col grids); ≤430 mobile (1 col, hamburger menu, sticky bottom CTA bar "Tham gia membership").
- `lang="vi"`, real Vietnamese copy with full diacritics, no lorem ipsum. Accessible contrast, visible focus states, semantic landmarks.
