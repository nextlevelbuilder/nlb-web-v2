# Báo cáo cuối — nextlevelbuilder.io v2 (2026-10-13)

## Kết quả
v2 đã chạy hoàn chỉnh trên Cloudflare account hi@nextlevelbuilder.io, dữ liệu thật đã migrate từ Neon sang D1 và kiểm chứng.

- Production: https://nextlevelbuilder-web.hi-7ac.workers.dev
- Staging: https://nextlevelbuilder-web-staging.hi-7ac.workers.dev
- Repo: https://github.com/nextlevelbuilder/nlb-web-v2 — PR review: https://github.com/nextlevelbuilder/nlb-web-v2/pull/1 (dev → main, chưa merge)
- Toolkits (blog CLI + MCP): https://github.com/nextlevelbuilder/nlb-directory-toolkits/pull/17 (chưa merge)

Domain `nextlevelbuilder.io` vẫn trỏ về site cũ trên account Digitop. Không tài nguyên nào ở Digitop hay Neon bị xoá hoặc sửa.

## Đã làm
| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| 100% tính năng site cũ | Xong | 32/32 route cũ có mặt; 20/20 route chính trả 200 trên cả hai worker |
| `/api/v1` + OpenAPI giữ nguyên | Xong | Chỉ thêm đường dẫn blog; smoke test bằng key tạm (đã xoá) pass |
| Neon → D1 không mất dữ liệu | Xong | 43/43 bảng khớp số dòng, hash id và hash giá trị từng dòng; backup D1 trước mỗi lần ghi |
| Thiết kế Constellation, EN/VI, sáng/tối/hệ thống | Xong | Không flash theme, console sạch, không cuộn ngang ở 320px |
| Nội dung mới | Xong | AgentKit, dewee, ReelCrew, 3 founders, partners, phần terminal theo toolkits thật, FAQ, đủ chính sách |
| Blog widget + API/CLI/MCP | Xong | Tạo bài qua REST và MCP đều render đúng widget, có lịch sử phiên bản |
| Courses (M2) | Code xong | Chưa mua → 403, VIP xem đến hết kỳ, Stream signed-only; chưa phát thử được vì Stream chưa bật |
| CI/CD | Xong một phần | Test job xanh; bước deploy fail ở D1 migrate vì token thiếu quyền |
| Code review | Xong | 2 lỗi cao + 6 lỗi trung bình đã sửa, có test; 700 test pass |
| UX/AX | Xong | Lighthouse a11y 100 (home EN/VI, blog, courses); 0 lỗi discovery trên 37 trang sitemap |
| Docs | Xong | `docs/` (getting-started, kiến trúc, design, blog, courses, migration, cutover runbook) |

## Quyết định em đã tự chốt
- Tạo `BETTER_AUTH_SECRET` mới (lưu trong `.env`); mọi người đăng nhập lại một lần sau cutover, API key không ảnh hưởng.
- Courses: chỉ VIP xem toàn bộ (Premium không); hoàn tiền một phần vẫn giữ quyền; VIP huỷ vẫn xem đến hết kỳ đã trả.
- CTA luôn bật, bấm vào mở hộp xác nhận điều khoản rồi sang Polar (giống popup site cũ).
- Đồng hồ ghế: chỉ hiện "còn N/M" khi đã kín ≥ 50%; trước đó hiện "Giới hạn M thành viên". Hiện Neon có 0 subscription nên đang hiện dạng giới hạn.
- Không bịa số: bỏ trust score hardcode, sản phẩm thành viên lấy live từ API (hiện chỉ AgentKit) kèm hàng "Built by the NLB team".
- Giữ Google Analytics (có công bố trong chính sách; không tải khi trình duyệt gửi DNT/GPC).
- Khôi phục FAQ trang chủ; bỏ 3 binding không dùng (queue, KV `/go`, AI) vì site cũ cũng không dùng.

## Việc anh cần làm (theo thứ tự)
1. **Review PR #1** và các trang pháp lý (Terms, Privacy, Refund, Cookies là bản nháp, cần luật sư xem).
2. **Mở quyền token** `CLOUDFLARE_API_TOKEN` (hi@): Workers Scripts, D1, KV, Queues, R2 edit + Account Settings read, và thêm Zone create/DNS edit. Sau đó cập nhật secret GitHub `CLOUDFLARE_API_TOKEN` để CI deploy được.
3. **Thêm zone** `nextlevelbuilder.io` vào account hi@ (hoặc để em làm sau khi token có quyền zone create), em sẽ import DNS từ bản đã đọc ở Digitop (`scripts/migrate/dump/digitop-dns-records.json`, giữ MX/TXT/DKIM).
4. **Đổi nameserver tại Spaceship** sang 2 NS mà Cloudflare cấp cho zone trên hi@.
5. **Bật Cloudflare Stream** và tạo token Stream để video Courses phát được.
6. Báo em để chạy cutover theo `docs/cutover-runbook.md`: final sync (chế độ upsert, không xoá dữ liệu mới trên v2), gắn custom domain, chuyển webhook Polar, cập nhật callback OAuth GitHub/Google.

## Câu hỏi còn mở
- Handle X chính thức: `@nextlevelbuilders` (đang dùng) hay `@nlb_io`?
- Bản tiếng Việt cho AgentKit và DIGITOP.AI là bản nháp; logo DIGITOP.AI và ReelCrew đang dùng chữ.
- MCP worker (`mcp.`), `ui-ux-pro-max-skill` và bucket `cdn.` vẫn ở Digitop; cần quyền đọc bucket cũ để copy file, và gắn `MCP_DELEGATION_SECRET` mới (đã lưu `.env`) khi chuyển MCP worker.
- Staging đang dùng chung Polar token với production; có muốn tạo Polar sandbox riêng cho staging?
- Staging có cần GitHub OAuth app riêng không (mỗi app chỉ có một callback host)?
- robots.txt có chặn crawler huấn luyện AI (GPTBot, ClaudeBot, CCBot) không?

## Báo cáo chi tiết
`plans/reports/`: `cook-261013-1759-nlb-web-v2-build.md`, `code-reviewer-261013-2016-codebase-review.md`, `live-check-261013-2016-production-workers-dev.md`, `cook-261013-2030-fix-pass-and-ux-ax.md`, `enhance-ux-ax-261013-2030-nlb-web-v2.md`, `researcher-261013-1800-v2-content-harvest.md`.
