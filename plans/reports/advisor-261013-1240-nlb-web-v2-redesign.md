# Advice: Redesign nextlevelbuilder.io → nlb-web-v2 (Cloudflare hi@, D1, Courses)

Ngày: 2026-10-13 · Trạng thái: reframing đã xác nhận (Q1–Q9) · Dạng: advisory, không implement.

## Needs from you

1. **Quyền truy cập Spaceship (registrar)** để đổi nameserver lúc cutover — chỉ anh làm được. Khuyến nghị: chuẩn bị sẵn login + tắt DNSSEC (nếu đang bật) trước ngày cutover.
2. **Premium có được xem Courses không?** Đang giả định chỉ VIP. Khuyến nghị: giữ VIP-only để VIP có lý do nâng cấp; nếu đổi, chỉ cần thêm product id vào allowlist entitlement.
3. **Secrets còn thiếu trong `nlb-web-v2/.env`** (chỉ tên biến): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `TURNSTILE_SECRET_KEY`, `POLAR_PRODUCT_DIRECTORY_EARLY_BIRD/STANDARD`, `DISCORD_SALES_WEBHOOK_URL`. Khuyến nghị: tạo **mới** BETTER_AUTH_SECRET không được — phải **giữ nguyên** secret cũ nếu muốn session/API key hash cũ còn hợp lệ; OAuth app GitHub/Google cần thêm callback URL `v2.nextlevelbuilder.io` tạm thời.

## 1. Verdict

Ý tưởng hợp lý và khả thi, nhưng là **ba dự án gộp một**: (a) redesign + repo mới, (b) di chuyển hạ tầng xuyên account Cloudflare kèm đổi engine DB, (c) tính năng Courses mới. Điểm đúng nhất anh đã chốt là tách M1 (cutover) khỏi M2 (Courses) và chạy song song trước khi đổi NS. Điểm rủi ro nhất không phải redesign mà là **Neon → D1**: dữ liệu nhỏ (~42 MB, 36 bảng) nên chuyển dữ liệu dễ, nhưng code đang dựa vào `db.transaction()` và kiểu Postgres (uuid, timestamp, jsonb) ở ~5 file quan trọng (webhook Polar, events, moderation). Chuyển zone giữa hai account là thao tác thủ công, không có lệnh `cf` cho nó; Worker/R2/KV/Hyperdrive **không chuyển được**, phải tạo lại ở account hi@. `cf` là CLI chính thức của Cloudflare (v1.0.0-beta.12) — dùng được cho deploy/D1/DNS, nhưng vẫn ở beta nên giữ wrangler làm fallback trong CI.

## 2. What you should do

1. **M0 – Chọn direction trước khi viết code UI**: 5 file HTML/Tailwind tĩnh (handoff brief ở cuối), chọn 1, rồi mới dựng design system trong repo v2.
2. **Khởi tạo repo `nextlevelbuilder/nlb-web-v2` (public)**: copy cấu trúc từ nlb-web (Next.js 16 + `@opennextjs/cloudflare`), `.gitignore` chặn mọi `.env*`, bật secret scanning + push protection trên GitHub ngay từ commit đầu.
3. **Port lớp DB sang D1 trước UI**: viết lại `lib/db/schema.ts` bằng `sqliteTable` (uuid → `text`, timestamp → `integer({mode:'timestamp_ms'})`, jsonb → `text({mode:'json'})`), đổi `drizzle-orm/postgres-js` → `drizzle-orm/d1`, thay mọi `db.transaction()` bằng `db.batch([...])`, thay `onConflictDoUpdate` Postgres-specific bằng cú pháp SQLite tương đương. Chạy toàn bộ 15 test file + test contract `/api/v1` trên D1 local (`wrangler d1 --local`) trước khi đụng UI.
4. **Script migrate dữ liệu có verify**: `pg_dump --data-only --inserts` từ Neon branch production → converter (uuid giữ text, timestamp → epoch ms, jsonb → JSON string, boolean → 0/1) → chia batch ≤1000 row → `cf d1 execute`/`wrangler d1 execute --file`. Sau import: so `COUNT(*)` từng bảng + hash tập `id` sắp xếp của mỗi bảng ở hai phía; lưu báo cáo verify vào `plans/reports/`. Script này chạy lại được (idempotent) vì sẽ chạy ít nhất 2 lần: rehearsal và final sync.
5. **Tạo hạ tầng ở account hi@** bằng `cf`/wrangler với token trong `.env` v2 (đã xác minh thuộc account hi@): D1 `nlb-prod` + `nlb-staging`, R2 `nlb-media-public` + `nlb-media-staging` (copy object bằng `rclone` S3→S3 với R2 API key của hai account), KV `GO_REDIRECTS` (export key/value bằng `wrangler kv key list/get` → `kv bulk put`), Turnstile widget mới cho domain, Workers AI binding, secrets qua `wrangler secret put`.
6. **CI/CD**: 2 workflow như hiện tại (`dev`→staging, `main`→prod) nhưng thêm bước `d1 migrations apply --remote` **trước** deploy và chạy `type-check` + `vitest` + smoke test `/api/health`. Dùng `cloudflare/wrangler-action` làm bước deploy chính; thêm `cf deploy` chỉ khi đã kiểm chứng `cf` chạy ổn trong CI (beta).
7. **Chạy song song trên `v2.nextlevelbuilder.io`** (zone tạm thời vẫn ở Digitop → thêm 1 CNAME/custom domain trỏ sang worker ở hi@; Workers custom domain yêu cầu zone cùng account nên dùng **DNS CNAME tới `*.workers.dev`** của worker v2 hoặc route tạm qua `nlb-web-v2.<subdomain>.workers.dev`). Test đăng nhập OAuth, OTP, checkout Polar sandbox, webhook (dùng endpoint Polar thứ hai trỏ về v2), CLI `nlb submit`.
8. **Cutover M1 (cửa sổ ~30 phút, downtime ≈ 0)**: (1) export DNS từ zone cũ (`cf dns records export` hoặc dashboard) → add zone ở hi@ → import → kiểm tra MX/TXT/DKIM/SPF/`cdn` còn nguyên; (2) bật maintenance/write-freeze trên site cũ (middleware trả 503 cho POST, hoặc tạm vô hiệu webhook endpoint cũ trên Polar); (3) chạy final sync + verify; (4) đổi NS tại Spaceship sang NS mới của zone hi@; gắn custom domain `nextlevelbuilder.io`, `www`, `staging` cho worker v2; (5) đổi webhook endpoint Polar và success URL sang domain chính; (6) theo dõi `wrangler tail` 24h; (7) sau 7 ngày xoá worker/hyperdrive cũ, giữ Neon read-only thêm 30 ngày rồi xoá.
9. **M2 – Courses**: bảng `videos` (id, slug, title, description, streamUid, durationSec, priceCents, polarProductId, status, publishedAt) + `video_purchases` tái dùng cơ chế `purchases`/`entitlements` đã có (`entitlements.scope = video:<id>`). Admin "publish" → gọi Polar API tạo product (giá riêng) → lưu `polarProductId`. Webhook `order.paid` → tạo entitlement. Trang xem: server kiểm tra entitlement **hoặc** VIP active → ký token Stream bằng signing key (JWT tự ký, không gọi API `/token` mỗi lần), TTL 1–2 giờ, kèm `accessRules` giới hạn referer domain. Dùng `requireSignedURLs=true` trên mọi video.

## 3. What you shouldn't do

- **Đừng redesign và migrate DB trong cùng một PR/nhánh.** Port DB sang D1 với UI cũ (hoặc UI tối thiểu) trước để tách lỗi "logic" khỏi lỗi "giao diện".
- **Đừng tạo `BETTER_AUTH_SECRET` mới** — sẽ huỷ toàn bộ session, và API key của builder (`api_keys` table, hash) có thể mất hiệu lực tuỳ cách Better Auth hash. Giữ nguyên secret cũ.
- **Đừng đổi contract `/api/v1` và OpenAPI** — `nlb-directory-toolkits` (CLI/MCP, đã publish npm) phụ thuộc. Chạy test contract từ `packages/contracts` làm gate CI.
- **Đừng giữ Hyperdrive "tạm" ở account mới để trì hoãn D1** — sẽ thành vĩnh viễn và phá mục tiêu một vendor.
- **Đừng dùng Cloudflare Registrar hay chuyển registrar lúc này** — Spaceship đang ổn; chỉ đổi NS. Chuyển registrar kéo theo 60-day lock và rủi ro DNSSEC.
- **Đừng dùng YouTube unlisted/iframe không ký cho Courses** — link lộ là xem được, trái với "mua video nào xem video đó".
- **Đừng tạo product Polar thủ công cho từng video** — tự động hoá từ admin publish, nếu không sẽ sai id/giá sau vài tuần.
- **Đừng xoá zone/worker cũ ngay sau khi đổi NS** — giữ 7 ngày để rollback bằng cách trỏ NS ngược lại.

## 4. What could be better / more efficient (xếp theo effort → impact)

1. **Dùng `drizzle-kit` sinh migration D1 từ schema mới + `wrangler d1 migrations apply`** thay vì viết SQL tay: nhỏ công, giảm lỗi kiểu.
2. **Rehearsal cutover trên staging** (zone thử, ví dụ một domain rẻ ở hi@) để diễn tập export/import DNS và đổi NS — 1 giờ, loại bỏ bất ngờ ngày thật.
3. **Giữ UI shadcn/Tailwind + next-intl** làm nền; thay token màu/typography/layout theo direction chọn thay vì đổi framework UI — redesign vẫn "hoàn toàn" về mặt nhìn thấy nhưng tái dùng 52 component logic.
4. **`entitlements` đã có sẵn** (purchases/offers/entitlements trong schema) — mở rộng thay vì bảng mới cho Courses.
5. **Một endpoint Polar webhook, phân loại theo product id** (đã có `isOurProduct` allowlist) — thêm `VIDEO_PRODUCT_IDS` động từ bảng `videos` thay vì env var.

## 5. My take and how to get there

Đi đúng thứ tự: **M0 mockup (1–2 ngày) → DB port + data migration rehearsal (tuần 1–2) → UI theo direction (tuần 2–4) → hạ tầng hi@ + CI (song song) → chạy song song 1 tuần → cutover (30 phút) → M2 Courses (tuần 6–8)**. Mốc đo quan trọng nhất là "verify report row count/hash khớp 100%" trước khi bất kỳ ai nhìn UI mới trên domain chính.

Về `cf` CLI: dùng cho thao tác one-off (tạo D1, apply migration, list/export DNS, deploy thử). Trong CI dùng `wrangler` (ổn định, có action chính thức); thêm `cf` khi ra bản stable.

Về Courses: Cloudflare Stream là lựa chọn đúng với ràng buộc "chỉ Cloudflare". Với ~50 video × 45 phút ≈ 2.250 phút lưu ≈ ~$12/tháng lưu trữ; chi phí phát $1/1000 phút xem — rẻ so với doanh thu bán lẻ.

## 6. Benefits

- Một account, một vendor, một billing; không còn Neon/Hyperdrive — đúng mục tiêu A3.
- Repo public + CI minh bạch là tài sản thương hiệu "builder" (A1).
- D1 + Stream + R2 cùng account → latency thấp, không egress.
- Cutover song song có đường lùi rõ ràng (NS ngược lại) → gần như không downtime.
- Courses tái dùng purchases/entitlements/webhook đã kiểm chứng.

## 7. Trade-offs

- **D1 thay Postgres**: mất transaction thật, giới hạn 10 GB/DB, 100 bound params/query, không có `FOR UPDATE`; idempotency webhook phải dựa vào `INSERT ... ON CONFLICT DO NOTHING` + batch. Nếu sau này cần analytics nặng (analytics_events tăng hàng triệu row) thì D1 sẽ là nút thắt — khi đó cân nhắc tách analytics sang Analytics Engine/R2 Data Catalog, chi phí chuyển ~1–2 tuần.
- **Repo public**: mọi lỗi bảo mật lộ ra; cần secret scanning + review kỹ `lib/env.ts`.
- **Redesign toàn bộ cùng lúc migrate**: tăng thời gian chạy song song và số thứ có thể sai; đã giảm bằng cách tách M1/M2 nhưng vẫn là 3 dự án.
- **Zone move thủ công**: ~5–30 phút "Pending" ở zone mới; SSL Universal cấp lại; email (MX/DKIM) phải import đúng — nếu sót TXT, email đến `hi@nextlevelbuilder.io` có thể gián đoạn (chính là account đang dùng để login CF!).
- **Stream signed URL** không chống screen-record; đủ cho "ai mua mới xem", không phải DRM.
- **`cf` beta**: lệnh có thể đổi; không đặt nó làm xương sống CI.

Điều kiện khuyến nghị này sai: nếu dữ liệu tăng >2 GB/năm hoặc cần join/analytics phức tạp → giữ Postgres (Neon + Hyperdrive ở hi@) tốt hơn; chi phí đổi ý lúc đó là chạy ngược script converter (~3 ngày).

## 8. Unverified

- **Row count từng bảng**: không có `DATABASE_URL` local (chỉ Hyperdrive); kích thước 42 MB lấy từ Neon API `synthetic_storage_size`. Xác nhận bằng `psql` vào Neon branch production.
- **Hành vi hash API key của Better Auth khi đổi secret**: suy luận từ tài liệu; kiểm tra `lib/auth-api-key.ts` + docs Better Auth trước cutover.
- **Workers custom domain qua zone khác account** không được hỗ trợ (tin cậy từ docs CF); phương án CNAME `workers.dev` cho `v2.` cần test thật.
- **Zone `nextlevelbuilder.io` đang ở account Digitop**: suy từ `wrangler whoami` + worker ở đó + zone không có ở hi@ (`cf zones list --name`). Token hi@ không thấy được account Digitop nên chưa list trực tiếp.
- **`cf dns records export`**: chỉ xác minh có `cf dns records list`; export định dạng BIND có thể phải dùng dashboard/API.
- Giá Stream/D1 lấy từ docs CF tháng 10/2026 (web search); kiểm tra lại trang pricing lúc bật dịch vụ.

## 9. Work checklist

- [ ] M0: tạo 5 mockup HTML theo handoff brief; chọn 1 direction.
- [ ] Tạo repo public `nextlevelbuilder/nlb-web-v2`, `.gitignore` `.env*`, bật secret scanning/push protection, branch `dev`/`main` protection.
- [ ] Scaffold Next.js 16 + `@opennextjs/cloudflare` + `wrangler.jsonc` (D1/R2/KV/AI bindings, env staging).
- [ ] Port `lib/db/schema.ts` → `sqliteTable`; `drizzle.config.ts` dialect `sqlite` driver `d1-http`; sinh migration.
- [ ] Thay `db.transaction()` → `db.batch()`; sửa `onConflict`, raw `sql\`\`` (4 chỗ); test trên D1 local.
- [ ] Port toàn bộ route app/[locale]/*, /api/*, middleware, i18n; chạy 15 test + contract test `/api/v1`.
- [ ] Viết `scripts/migrate-neon-to-d1.ts` (dump → convert → batch import → verify report); rehearsal lên D1 staging.
- [ ] Tạo tài nguyên ở hi@: D1 ×2, R2 ×2 (+ rclone copy), KV (+ copy keys), Turnstile widget, Workers AI, secrets (giữ BETTER_AUTH_SECRET cũ).
- [ ] Thêm callback URL mới vào GitHub/Google OAuth app; endpoint Polar webhook thứ 2 cho v2.
- [ ] GitHub Actions: test → d1 migrations apply → deploy (staging/prod); secrets `CLOUDFLARE_API_TOKEN/ACCOUNT_ID` của hi@.
- [ ] Deploy v2 lên `v2.nextlevelbuilder.io`; smoke test auth/OTP/OAuth, checkout Polar, webhook, `/go`, media upload, CLI `nlb submit`, OpenAPI.
- [ ] Rehearsal zone move trên domain thử; chuẩn bị DNS export, checklist MX/SPF/DKIM/TXT.
- [ ] Cutover M1: write-freeze → final sync + verify → add zone + import DNS → đổi NS tại Spaceship → custom domains → Polar URL → monitor 24h.
- [ ] Sau 7 ngày: xoá worker/hyperdrive cũ; Neon read-only 30 ngày rồi xoá; cập nhật `docs/deployment-guide.md` của v2.
- [ ] M2: schema `videos` + entitlement scope; admin publish → Polar product; webhook → entitlement; trang Courses (list, detail, player); Stream signing key + token endpoint; VIP allowlist; test 403.

## 10. Success metrics

- `SELECT COUNT(*)` 36 bảng D1 = Neon tại thời điểm freeze; hash tập id khớp 100% (báo cáo verify lưu trong `plans/reports/`).
- `curl https://nextlevelbuilder.io/api/health` trả 200 từ worker ở account hi@ (`cf-ray` + `wrangler deployments list` ở hi@).
- Toàn bộ test + contract test pass trong CI; `nlb submit` CLI (đã publish) thành công không đổi code toolkit.
- 0 ticket mất session/API key sau cutover; OAuth GitHub/Google + OTP hoạt động trong 1 giờ đầu.
- Email tới `hi@nextlevelbuilder.io` vẫn nhận được sau đổi NS (gửi test ngay sau cutover).
- Polar webhook: 100% event sau cutover có bản ghi `webhook_events` ở D1; 0 event 401.
- M2: mua test 1 video → xem được ≤ 5 phút sau thanh toán; tài khoản khác nhận 403; VIP xem tất cả.
- Chuyển đổi: tỷ lệ homepage → sign-up và → Polar checkout cao hơn baseline 30 ngày trước cutover (đo bằng `analytics_events`).

## 11. Handoff brief

### 11a. Toàn bộ dự án (cho `ak:plan` / `ak:cook`)

```text
Objective: Dựng repo public nextlevelbuilder/nlb-web-v2 (Next.js 16 + OpenNext/Workers, Drizzle/D1) tái hiện 100% tính năng nextlevelbuilder.io với giao diện mới theo direction đã chọn, di chuyển toàn bộ hạ tầng + dữ liệu sang Cloudflare account hi@nextlevelbuilder.io (D1, R2, KV, AI, Turnstile), CI/CD GitHub Actions, cutover song song không mất dữ liệu; sau đó thêm Courses (Cloudflare Stream signed URL, bán lẻ từng video qua Polar, VIP active xem tất cả).
Done means: (M1) nextlevelbuilder.io phục vụ từ worker ở account hi@; DB là D1; row count + hash id 36 bảng khớp Neon; mọi route/API cũ pass test; CLI nlb submit OK; CI xanh; site cũ tắt. (M2) mua 1 video qua Polar → xem được; chưa mua → 403; VIP active xem tất cả.
Out of scope: đổi cổng thanh toán; đổi auth provider; viết lại toolkits; DRM cứng; app mobile.
Constraints: giữ DB + toàn bộ tính năng; Polar.sh; chỉ Cloudflare; D1; account hi@; repo public, không commit secrets (.env* ignored); /api/v1 + OpenAPI contract không đổi; giữ nguyên BETTER_AUTH_SECRET; dùng cf CLI cho thao tác one-off, wrangler trong CI; báo cáo vào plans/reports/.
Stop and ask only if: verify row count/hash không khớp sau 2 lần chạy; cần xoá tài nguyên ở account Digitop hoặc Neon; cần đổi NS tại Spaceship (user làm); phát hiện API key cũ mất hiệu lực khi test; cần đổi contract /api/v1.
```

### 11b. 5 mockup homepage (M0)

```text
Objective: Tạo 5 file HTML tĩnh độc lập (Tailwind qua CDN hoặc inline CSS, không build step) cho homepage nextlevelbuilder.io mới, mỗi file một phong cách khác hẳn, nội dung thật của NLB, mở trực tiếp bằng browser.
Output: /Volumes/GOON/www/nlb/nlb-web-v2/plans/reports/mockups/01-<style>.html … 05-<style>.html + index.html liệt kê 5 mẫu (link + ảnh mô tả 1 dòng).
Thông điệp lõi (từ interview): NLB = cộng đồng builder + Courses video hàng tuần + Directory sản phẩm đã xác minh (Trust Passport). CTA chính: tham gia membership (Premium/VIP, quarterly/annual, early-bird) và mua video; CTA phụ: submit product vào directory, dùng CLI/MCP.
Sections bắt buộc (thứ tự có thể đổi theo style): header + nav (vi/en switch, sign-in), hero với 1 câu định vị + 2 CTA, "3 trụ cột" (Cộng đồng / Courses / Directory), Courses teaser (3 thẻ video có giá lẻ + badge "VIP xem miễn phí"), Directory highlight (top products / leaderboard tuần), social proof (số builder, sản phẩm, testimonial), pricing membership (Premium vs VIP, quarterly/annual), Build-with-us/toolkits (CLI/MCP snippet), footer (policies, Discord, GitHub).
5 phong cách (mỗi file một): (1) Editorial/Swiss — typographic, grid rõ, nhiều khoảng trắng, serif + sans; (2) Dark Terminal/Developer — nền tối, mono, code snippet, accent neon; (3) Bold Brutalist — viền dày, màu phẳng mạnh, khối lớn, hiệu ứng hover thô; (4) Soft Glass/Gradient — nền gradient dịu, card trong mờ, bo tròn, cảm giác SaaS hiện đại; (5) Community-first/Playful — avatar, feed hoạt động, màu ấm, minh hoạ nhẹ, nhấn vào con người.
Breakpoints: ≥1280 desktop, 768–1024 tablet (nav gọn, grid 2 cột), ≤430 mobile (1 cột, CTA sticky bottom, hamburger). Dùng ảnh placeholder từ picsum/unsplash hoặc gradient; logo text "Next Level Builders". Ngôn ngữ mặc định tiếng Việt, copy ngắn, không lorem ipsum.
Constraints: mỗi file < 200 KB, không JS framework, chỉ vanilla JS cho nav/hamburger; cùng nội dung ở cả 5 mẫu để so sánh công bằng; không dùng asset/secret từ repo cũ; không implement vào repo v2.
Stop and ask only if: thiếu thông tin giá membership (lấy từ messages/vi.json của nlb-web nếu cần).
```

## Unresolved questions

1. Premium có được xem Courses miễn phí không (đang giả định chỉ VIP)?
2. Số video hiện có và độ dài trung bình thật (đang giả định ~50 × 30–60 phút)?
3. Hành vi API key Better Auth khi giữ/đổi secret — cần xác minh trước cutover.
4. `cdn.nextlevelbuilder.io` hiện trỏ vào đâu (R2 public bucket custom domain?) — cần kiểm tra DNS export.
