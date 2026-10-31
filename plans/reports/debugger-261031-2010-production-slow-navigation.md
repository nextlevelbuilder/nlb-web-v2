# Vì sao nextlevelbuilder.io chuyển trang chậm

Ngày đo: 2026-10-31, từ Việt Nam, Cloudflare colo SIN.

## Kết luận

Trang chậm chủ yếu vì Worker phải khởi động gần như ở mọi request. Bundle 50 MB rất khó giữ ấm, nên phần lớn request đều phải nạp và compile lại isolate. Bản thân code của trang không chậm. Phần mất khoảng 3 giây xảy ra trước khi handler chạy, và Cloudflare không tính phần này vào wall time.

## Số liệu

| Đo | Kết quả |
|---|---|
| TTFB HTML (`/`, `/vi`, `/courses`, `/blog`, kể cả trang 404) | 2,8–10,6 s |
| TTFB `/api/chat/status`, route chỉ đọc env | 2,6–4,0 s, kể cả 6 request liên tiếp trên cùng một kết nối keep-alive |
| TTFB file tĩnh (`/_next/static/*`, `favicon.ico`), không đi qua Worker | 0,2–0,7 s |
| RSC request khi chuyển trang phía client (`/vi` với `RSC: 1`) | 4,2 s |
| `wrangler tail`: wall time do Worker báo | 0,19–1,2 s (`/api/chat/status` là 0,19 s, trong khi client đo được 3,4 s) |
| `wrangler tail`: CPU time | 170 ms cho `/api/chat/status` và `/robots.txt`; 300–960 ms cho trang và RSC |
| Kích thước bundle (log deploy production) | 31,6 MB, gzip 6,4 MB (18/10) → 46,8 MB, gzip 9,2 MB (29/10) → 50,2 MB, gzip 9,8 MB (31/10) |
| `handler.mjs` build local | 27 MB, cùng 1.471 chunk server do Turbopack sinh ra (22 MB) |
| `wrangler check startup` (đo trên máy local) | Cửa sổ 720 ms, trong đó 204 ms CPU và 516 ms parse/compile |
| Deploy staging lúc 12:20 ngày 31/10 | Thất bại với `Script startup exceeded CPU time limit` (code 10021) |

## Nguyên nhân, xếp theo mức ảnh hưởng

1. **Worker bị cold start ở hầu hết request.** Có ba bằng chứng:
   - Client chờ khoảng 3 giây, nhưng Worker chỉ báo khoảng 0,2 giây wall time.
   - Request JSON đơn giản nhất vẫn tốn 170 ms CPU, vì mỗi isolate mới phải nạp lại chunk của route.
   - Các request liên tiếp không nhanh dần, nghĩa là không có isolate nào được giữ ấm.

   Bundle 50 MB (gzip 9,8 MB) đã sát giới hạn 10 MB, và CPU lúc khởi động đã vượt ngưỡng ở staging.
2. **Bundle phình nhanh từ 18/10.** Bundle tăng 18,6 MB, trùng thời điểm có các commit sau:
   - `9c730e1` mount MCP server vào web Worker;
   - `610b908` chuyển lên MCP SDK v2;
   - Builder League, Live và Dewee webchat.

   Bundle hiện chứa hai bản zod (3.25.76 và 4.5.4, bản sau nằm trong `@better-auth/oauth-provider`). Profile khởi động cho thấy zod và MCP chạy `preloadSchemas`/`buildSchemas2026` ngay ở top level.
3. **Không có cache cho HTML.** `open-next.config.ts` là `defineCloudflareConfig({})`, không có incremental cache, nên trang SSG/ISR vẫn render lại ở mọi request. Header trả về là `Cache-Control: private, no-store`, nên CDN không cache được, và lượt truy cập ẩn danh nào cũng phải chạy Worker.
4. **Prefetch nhân số lần khởi động Worker.** Khi trang vừa tải, `<Link>` prefetch mọi link đang hiển thị. Mỗi `?_rsc=` là một request vào Worker, tốn 300–900 ms CPU và có thể kèm cold start. Chỉ `build-with-us` và `leaderboards` có `loading.tsx`, nên các trang khác không có phản hồi tức thì khi bấm.
5. **Phụ: request ACME lặp lại liên tục.** Trong khoảng 75 giây tail, có nhiều request `/.well-known/acme-challenge/*` trên `http://www.` và `http://` vào Worker, mỗi request tốn 260–960 ms CPU. Có vẻ việc cấp chứng chỉ cho một hostname đang bị kẹt và cứ thử lại. Nên kiểm tra mục SSL/Custom Hostnames.

## Đề xuất sửa, xếp theo hiệu quả trên công sức

1. **Cache HTML ẩn danh ở edge (nhanh nhất).** Thêm Cache Rule cho các trang công khai: cache khi request không có cookie phiên, TTL ngắn, dùng stale-while-revalidate. Kèm theo đó, đặt `Cache-Control: public, s-maxage=…` cho các trang không phụ thuộc người dùng. Khách ẩn danh khi đó sẽ không chạm vào Worker, và TTFB dự kiến xuống còn 0,1–0,3 s.
2. **Tách MCP server ra Worker riêng và gọi qua service binding.** Có thể quay lại cách làm cũ với `nlb-directory-mcp`. Làm vậy sẽ bỏ được MCP SDK, zod 3 và schema preload khỏi bundle web, và gỡ nguy cơ chạm giới hạn 10 MB.
3. **Giảm bundle web.**
   - Gộp zod về một bản duy nhất bằng `overrides`.
   - Import động các SDK nặng (Polar, Dewee server, `@vercel/og`/resvg) bên trong route, thay vì để ở top level.
   - Kiểm tra `prettier` (0,23 MB) có lọt vào bundle runtime hay không.
   - Thêm bước CI fail khi gzip vượt 8 MB.
4. **Bật incremental cache cho OpenNext** (R2 hoặc KV, kèm tag cache) để trang SSG/ISR không phải render lại.
5. **Giảm tác động của prefetch và cải thiện cảm giác khi chuyển trang.**
   - Tắt prefetch (`prefetch={false}`) cho các link trong footer và các danh sách dài.
   - Thêm `loading.tsx` ở cấp `[locale]` để có skeleton hiển thị ngay khi bấm link.
6. **Xử lý vòng ACME** trong dashboard Cloudflare.

## Câu hỏi còn mở

- Có muốn áp Cache Rule cho HTML ẩn danh trên production không? Việc này thay đổi cấu hình zone, nên cần bạn đồng ý.
- Đồng ý tách MCP về Worker riêng, hay muốn giữ MCP trong cùng Worker và chỉ giảm bundle?
- Hostname nào đang lặp ACME challenge (`www.nextlevelbuilder.io`)? Cần xem trong dashboard SSL.
