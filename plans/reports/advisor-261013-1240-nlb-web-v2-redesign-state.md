# advise-state
phase: advise
input: Redesign nextlevelbuilder.io hoàn toàn (giữ DB & tính năng) → repo mới nextlevelbuilder/nlb-web-v2 (public); deploy Cloudflare + CI/CD (cf CLI); chuyển domain+worker từ CF account digitop.vn@gmail.com → hi@nextlevelbuilder.io; Neon Postgres → D1 không mất dữ liệu; giữ Polar.sh; trang Courses bán lẻ video hàng tuần, mua video nào xem video đó. Sau advice: 5 mockup homepage (responsive mobile/tablet) để chọn direction.
flags: --agent (orchestrated; answers relayed). Output language: Vietnamese.
report_path: /Volumes/GOON/www/nlb/nlb-web-v2/plans/reports/advisor-261013-1240-nlb-web-v2-redesign.md

## scout-findings (verified)
- Current site /Volumes/GOON/www/nlb/nlb-web: Next.js 16 + OpenNext on Workers (worker `nextlevelbuilder-web` + `-staging`), Drizzle (postgres-js) via Hyperdrive→Neon, Better Auth (email OTP, GitHub, Google, organization/admin/apiKey/bearer/deviceAuthorization plugins), Polar (memberships Premium/VIP quarterly/annual + Directory listing one-time; webhook at /api/webhooks/polar, sync, idempotent via webhook_events + transactions), Resend, Turnstile, Discord role assignment, R2 (nlb-media-staging/public), KV GO_REDIRECTS (/go/[slug]), Workers AI binding (moderation), Queue producer declared but unused. next-intl vi (default)/en. Routes: home, products/[slug], builders, leaderboards, build-with-us, studio/products, profile, account, policies, sign-in/up, success, /api/v1 (products, votes, rankings, stats, media, api-keys, admin), /api/docs (Scalar OpenAPI), /llms.txt. Tests: 15 vitest files. ~75 tsx files.
- Private repo mrgoonie/nextlevelbuilder-web; nextlevelbuilder/nlb-web-v2 does NOT exist yet on GitHub. nlb-directory-toolkits (CLI/MCP/contracts in packages/*) consume /api/v1 → public API contract must stay stable.
- DB schema (lib/db/schema.ts, 445 lines, 36 tables): all PKs uuid defaultRandom, timestamps, 14 jsonb columns (payload/document/snapshots/ranks), no pg enums, no array columns. Neon project `nextlevelbuilder.io` region aws-ap-southeast-1, PG18, storage ≈ 42 MB (via Neon API) → far below D1 10 GB cap. No DATABASE_URL locally (Hyperdrive only) → row counts not obtained. PG-specific code: ~5 files use db.transaction()/onConflict (webhook route, domain/events, moderation, analytics, catalog); 4 raw sql`` usages. D1 has no interactive transactions → must switch to db.batch().
- Cloudflare: `cf` CLI IS real (official Cloudflare CLI v1.0.0-beta.12, at ~/.nvm/.../bin/cf; has `cf deploy`, `cf d1 create/migrations apply`, `cf zones`, `cf dns`, `cf builds`). wrangler 4.149 logged in (OAuth default.toml) to Digitop.vn@gmail.com account where worker + Hyperdrive + R2 + KV live. v2 .env CLOUDFLARE_API_TOKEN belongs to "Hi@nextlevelbuilder.io's Account" (many other zones already there); zone nextlevelbuilder.io NOT in hi@ account. Registrar: Spaceship (not CF Registrar), NS jim/emily.ns.cloudflare.com. Zone move = add zone in new account → export/import DNS → change NS at Spaceship; account-level resources (Workers, R2, KV, Hyperdrive, Queues, AI) do not move; must be re-created.
- v2 .env has: CLOUDFLARE_*, DISCORD_*, NEON_API_KEY, NEXT_PUBLIC_*, POLAR_* (6 product ids), POLAR_ACCESS_TOKEN/ORG/WEBHOOK_SECRET, RESEND_*. MISSING vs current: BETTER_AUTH_SECRET/URL, GITHUB/GOOGLE OAuth, TURNSTILE_SECRET_KEY, POLAR_PRODUCT_DIRECTORY_*, DISCORD_SALES_WEBHOOK_URL.
- Video: Cloudflare Stream ($5/1000 min stored, $1/1000 min delivered, signed URLs/tokens no surcharge) vs Bunny Stream (GB-based, embed token auth, DRM $99/mo) vs R2+own player (cheap, no transcoding/ABR, access via signed R2 URLs).

## qa-log
- Q1: Redesign để đạt gì / site cũ hỏng ở đâu? -> A1: Định vị lại thương hiệu — site cũ không phản ánh NLB hiện tại (cộng đồng + courses + directory); cần diện mạo & thông điệp mới để tăng chuyển đổi membership/courses.

- Q2: Mockup format? -> A2: HTML tĩnh (5 file HTML/Tailwind độc lập, nội dung thật NLB, resize xem mobile/tablet).
- Q3: Vì sao D1? -> A3: Gom toàn bộ về Cloudflare; chấp nhận viết lại lớp DB, chạy song song verify dữ liệu.
- Q4: Courses video hosting? -> A4: Cloudflare Stream + signed URL. (Chưa trả lời: số video/độ dài; Premium/VIP xem free?)
- Q5: Cutover? -> A5: Song song rồi cắt chuyển (v2.nextlevelbuilder.io ở account hi@, final sync + write freeze, đổi NS).

- Q6: Entitlement Courses vs membership? -> A6: Mua lẻ + VIP còn hiệu lực xem toàn bộ; hết hạn chỉ còn video đã mua. Premium: không nói → giả định VIP only.
- Q7: Giá & quy mô video? -> A7: Giá tuỳ video, ~1 video/tuần, mỗi video = 1 Polar product tạo tự động khi publish. Số video/độ dài: chưa rõ.
- Q8: Done means? -> A8: Mốc 1 cutover (100% tính năng cũ + design mới + D1 + account hi@ + CI/CD), Mốc 2 Courses.

## reframing-draft
phase: preview
problem: Site nextlevelbuilder.io (Next.js/OpenNext, Neon qua Hyperdrive, account CF Digitop) không còn phản ánh NLB hiện tại (cộng đồng + courses + directory). Cần repo public mới nlb-web-v2 với diện mạo/thông điệp mới, giữ 100% tính năng & dữ liệu, gom toàn bộ hạ tầng về account hi@nextlevelbuilder.io với D1, CI/CD, rồi thêm Courses bán lẻ video.
requirements:
 1. Repo public nextlevelbuilder/nlb-web-v2; Next.js + OpenNext trên Workers; Drizzle dialect sqlite/D1.
 2. Tái hiện toàn bộ tính năng cũ: auth (OTP/GitHub/Google), directory products/builders/leaderboards/studio/moderation AI, Polar memberships + directory listing + webhook, /go KV, R2 media, /api/v1 + OpenAPI contract không đổi (toolkits), i18n vi/en.
 3. Neon→D1: schema sqlite tương đương (uuid text, timestamp integer ms, jsonb text json), export → import → verify đếm row + checksum mọi bảng; transaction → batch.
 4. Hạ tầng ở account hi@: Worker prod+staging, D1 prod+staging, R2 2 bucket (copy object), KV GO_REDIRECTS (copy keys), Workers AI, Turnstile widget mới, secrets.
 5. Zone nextlevelbuilder.io chuyển về hi@: export DNS, add zone, import, đổi NS tại Spaceship; giữ MX/email; custom domains www, staging, cdn.
 6. CI/CD GitHub Actions: dev→staging, main→prod; build OpenNext, `cf deploy`/wrangler, D1 migrations apply trước deploy.
 7. Polar: giữ org/products; cập nhật webhook endpoint URL + redirect/success URL sang domain v2 lúc cutover.
 8. Cutover song song: v2.nextlevelbuilder.io → final sync + write-freeze → đổi NS/DNS → rollback = trỏ lại.
 9. Mốc 2 Courses: video Cloudflare Stream signed URL; mỗi video = Polar product tự tạo khi publish; entitlement per-video + VIP active xem tất cả.
 10. 5 mockup homepage HTML/Tailwind tĩnh, nội dung thật, responsive, 5 phong cách khác nhau.
goals: định vị lại thương hiệu → tăng chuyển đổi membership/courses; 1 vendor 1 account; nền tảng sẵn cho Courses.
done means: (M1) nextlevelbuilder.io phục vụ từ worker ở account hi@, DB = D1, row counts khớp Neon, toàn bộ route/API cũ pass test + toolkits CLI submit OK, CI xanh, site cũ tắt; (M2) mua 1 video qua Polar → xem được bằng signed URL; user khác bị 403; VIP xem tất cả. (Mockups) 5 file HTML mở được, 3 breakpoint.
non-goals: đổi cổng thanh toán; đổi auth provider; viết lại toolkits; DRM cứng; app mobile.
constraints: giữ DB + toàn bộ tính năng; Polar.sh; Cloudflare only; D1; account hi@; repo public (không commit secrets); API v1 contract stable; dùng cf CLI.

## preview
Rendered inline by orchestrator (2-lane diagram + M0/M1/M2). Q9 confirm -> A9: Matches; assumptions accepted (VIP only; ~50 videos 30–60 min).

## next
Write advice report, emit ADVICE_READY.
