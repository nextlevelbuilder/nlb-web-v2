import type { PolicyEntry } from "./policy-types";

/**
 * Privacy Policy, written for v2 from what the code actually processes
 * (lib/auth.ts, lib/polar.ts, lib/resend.ts, lib/media, lib/moderation,
 * lib/traffic, lib/traffic-client.ts, lib/discord.ts, wrangler bindings) plus
 * the Google Analytics 4 tag in app/layout.tsx (gated on DNT/GPC).
 * LEGAL REVIEW PENDING: not yet reviewed by counsel. Keep the processor list
 * in sync with the code whenever a provider is added or removed.
 */
export const privacyPolicy: PolicyEntry = {
  group: "legal",
  lastUpdated: "2026-10-13",
  legalReviewPending: true,
  content: {
    en: {
      navLabel: "Privacy Policy",
      title: "Privacy Policy",
      summary: "What personal data Next Level Builders collects, why, who processes it and the choices you have.",
      sections: [
        {
          heading: "1. Who we are",
          content:
            'Next Level Builders ("NLB", "we", "us") operates nextlevelbuilder.io and is responsible for the personal data described here. Questions or requests: hello@nextlevelbuilder.io.\n\nThis policy covers the website, memberships, courses, the Build with Us directory, Studio, the API, the MCP server and our emails. Payments are handled by Polar as merchant of record, which is responsible for the payment data it collects under its own privacy policy.',
        },
        {
          heading: "2. Data we collect",
          content:
            "Account data:\n• Name, email address and profile picture from Google or GitHub when you sign in with them, plus the provider's account identifier\n• Your email address and a short-lived one-time code when you sign in by email\n• Session records (sign-in time, IP address and browser user agent) that keep you signed in and protect your account\n\nProfile and community data:\n• Profile details you add, such as bio, links and social handles\n• Answers to the membership information and commitment forms\n• Your Discord user ID when you link Discord, so we can assign your membership role\n\nPurchase data:\n• From Polar: customer ID, name, email, country, plan or course purchased, amount, currency and subscription status\n• We never receive your full card number or bank details\n\nContent you submit:\n• Product listings, Studio pages, images and videos you upload, votes and other contributions\n\nAPI and connected apps:\n• API keys, stored only as a SHA-256 hash\n• OAuth and MCP client registrations, consent records and access tokens for apps you connect\n\nUsage data:\n• Pages viewed (path only), the referring site's origin and clicks on product website links, linked to a random visitor ID that lives in your browser tab (see section 5)\n• Through Google Analytics: pages visited, approximate location derived from your IP address, device and browser type and how you arrived, linked to the _ga cookie identifier (see section 5)\n\nSecurity data:\n• IP address and request metadata processed by Cloudflare to deliver the site, rate-limit abuse and run Turnstile bot checks",
        },
        {
          heading: "3. How we use your data and why",
          content:
            "• To provide the services you ask for: accounts, memberships, courses, directory listings, Studio and the API (performance of a contract)\n• To review membership applications and enforce the community policies (contract and legitimate interests)\n• To send sign-in codes, purchase-related notices and important service emails (contract)\n• To keep the services secure, prevent fraud, spam and ranking manipulation (legitimate interests)\n• To screen product submissions: an AI model running on Cloudflare Workers AI flags possible spam or abuse for our reviewers, and a person makes every publishing decision (legitimate interests)\n• To measure aggregate traffic and show product owners their traffic statistics (legitimate interests)\n• To keep records required by law, for example for tax (legal obligation)\n\nWe only send marketing emails if you opt in, and you can unsubscribe at any time.",
        },
        {
          heading: "4. Who processes your data",
          content:
            "We share personal data only with providers that help us run the services, under agreements that limit their use of it:\n• Cloudflare: hosting and content delivery (Workers), database (D1), file storage (R2), key-value storage, queues, AI moderation (Workers AI), bot protection (Turnstile) and course video delivery (Stream)\n• Polar: merchant of record for payments, subscriptions, invoices and taxes\n• Resend: delivery of sign-in codes and transactional email\n• Google and GitHub: sign-in, only when you choose them\n• Google Analytics 4 (Google LLC) and PostHog: aggregate website analytics\n• ClickHouse: product traffic statistics for the Build with Us directory, stored with hashed visitor IDs\n• Discord: assigning your membership role when you link Discord\n\nPublic by design: your public builder profile, published product listings, vote counts and leaderboard positions are visible to everyone.\n\nWe do not sell or rent your personal data. We may disclose data if the law requires it or to protect the rights and safety of our members.",
        },
        {
          heading: "5. Analytics",
          content:
            "Google Analytics:\n• We use Google Analytics 4 (Google LLC) to measure aggregate site usage. It sets the first-party cookies _ga and _ga_<container-id>, kept for up to 2 years (see the Cookie Policy).\n• We do not load Google Analytics when your browser sends Do Not Track or Global Privacy Control. You can also opt out with Google's Analytics opt-out browser add-on.\n• We do not use advertising cookies.\n\nOur own traffic counts:\n• Product and directory traffic counts set no cookies. Your browser keeps a random ID in session storage, deleted when you close the tab.\n• The ID is hashed with a secret before product traffic is stored, and only page paths, referring origins and product link clicks are recorded.\n• Sign-in, account, profile, OAuth and checkout success pages, and Studio previews, are never counted.\n• If your browser sends Do Not Track or Global Privacy Control, these counts are skipped too.",
        },
        {
          heading: "6. International transfers",
          content:
            "Our providers may process data in countries other than yours, including the United States and the European Union. Where required, transfers rely on safeguards such as the European Commission's Standard Contractual Clauses.",
        },
        {
          heading: "7. How long we keep data",
          content:
            "• Account, profile and content data: while your account is open. When you ask us to delete your account, we delete or anonymise it within 30 days, apart from backups that expire on their normal cycle.\n• Purchase records: as long as tax and accounting law requires.\n• Sign-in codes: minutes. Expired sessions: removed after they end.\n• Traffic statistics: kept in aggregated or pseudonymous form so product owners can see their history.\n• Security logs: kept only as long as needed to investigate abuse.",
        },
        {
          heading: "8. Your rights",
          content:
            "Depending on where you live, you can ask to:\n• access a copy of your personal data;\n• correct inaccurate data;\n• delete your data;\n• receive your data in a portable format;\n• object to or restrict processing based on legitimate interests;\n• withdraw consent where we rely on it.\n\nEmail hello@nextlevelbuilder.io from the address on your account. We reply within 30 days and may need to verify your identity. You can also complain to your local data protection authority.",
        },
        {
          heading: "9. Security",
          content:
            "We use HTTPS everywhere, hash API keys, scope OAuth tokens to the permissions you approve, serve private media through signed, expiring links and limit staff access to what each task needs. No system is perfectly secure; if a breach affects you, we will notify you as the law requires.",
        },
        {
          heading: "10. Children",
          content:
            "The services are not intended for anyone under 16, and we do not knowingly collect their data. If you believe a child has given us personal data, contact us and we will delete it.",
        },
        {
          heading: "11. Changes and contact",
          content:
            "We will update this policy when our practices change and show the new date at the top. For material changes we will also tell you by email or on the site.\n\nNext Level Builders · nextlevelbuilder.io · hello@nextlevelbuilder.io",
        },
      ],
    },
    vi: {
      navLabel: "Chính sách quyền riêng tư",
      title: "Chính sách quyền riêng tư",
      summary: "Next Level Builders thu thập dữ liệu cá nhân nào, vì sao, ai xử lý và bạn có những lựa chọn gì.",
      sections: [
        {
          heading: "1. Chúng tôi là ai",
          content:
            'Next Level Builders ("NLB", "chúng tôi") vận hành nextlevelbuilder.io và chịu trách nhiệm về dữ liệu cá nhân được mô tả tại đây. Câu hỏi hoặc yêu cầu: hello@nextlevelbuilder.io.\n\nChính sách này áp dụng cho website, gói thành viên, khóa học, thư mục Build with Us, Studio, API, máy chủ MCP và email của chúng tôi. Thanh toán do Polar xử lý với vai trò merchant of record; Polar chịu trách nhiệm về dữ liệu thanh toán mà họ thu thập theo chính sách quyền riêng tư riêng.',
        },
        {
          heading: "2. Dữ liệu chúng tôi thu thập",
          content:
            "Dữ liệu tài khoản:\n• Tên, email và ảnh đại diện từ Google hoặc GitHub khi bạn đăng nhập bằng các dịch vụ này, kèm mã định danh tài khoản của nhà cung cấp\n• Email và mã dùng một lần có hiệu lực ngắn khi bạn đăng nhập bằng email\n• Bản ghi phiên đăng nhập (thời điểm, địa chỉ IP và trình duyệt) để duy trì đăng nhập và bảo vệ tài khoản\n\nDữ liệu hồ sơ và cộng đồng:\n• Thông tin hồ sơ bạn thêm như giới thiệu, liên kết và tài khoản mạng xã hội\n• Câu trả lời trong form thông tin thành viên và form cam kết\n• Discord user ID khi bạn liên kết Discord, để cấp vai trò thành viên\n\nDữ liệu mua hàng:\n• Từ Polar: mã khách hàng, tên, email, quốc gia, gói hoặc khóa học đã mua, số tiền, đơn vị tiền tệ và trạng thái đăng ký\n• Chúng tôi không bao giờ nhận số thẻ đầy đủ hay thông tin ngân hàng của bạn\n\nNội dung bạn gửi:\n• Thông tin sản phẩm, trang Studio, hình ảnh và video bạn tải lên, lượt bình chọn và các đóng góp khác\n\nAPI và ứng dụng kết nối:\n• Khóa API, chỉ lưu dưới dạng băm SHA-256\n• Đăng ký ứng dụng OAuth và MCP, bản ghi đồng ý và access token của ứng dụng bạn kết nối\n\nDữ liệu sử dụng:\n• Trang đã xem (chỉ đường dẫn), nguồn giới thiệu và lượt bấm vào liên kết website sản phẩm, gắn với một mã khách truy cập ngẫu nhiên nằm trong tab trình duyệt (xem mục 5)\n• Qua Google Analytics: trang đã xem, vị trí ước tính từ địa chỉ IP, loại thiết bị và trình duyệt, nguồn truy cập, gắn với mã định danh trong cookie _ga (xem mục 5)\n\nDữ liệu bảo mật:\n• Địa chỉ IP và siêu dữ liệu yêu cầu do Cloudflare xử lý để phân phối website, giới hạn lạm dụng và chạy kiểm tra bot Turnstile",
        },
        {
          heading: "3. Mục đích và cơ sở sử dụng dữ liệu",
          content:
            "• Cung cấp dịch vụ bạn yêu cầu: tài khoản, gói thành viên, khóa học, thư mục sản phẩm, Studio và API (thực hiện hợp đồng)\n• Xét duyệt đăng ký thành viên và áp dụng quy chế cộng đồng (hợp đồng và lợi ích chính đáng)\n• Gửi mã đăng nhập, thông báo liên quan đến giao dịch và email dịch vụ quan trọng (hợp đồng)\n• Bảo mật dịch vụ, ngăn gian lận, spam và thao túng thứ hạng (lợi ích chính đáng)\n• Sàng lọc sản phẩm gửi lên: một mô hình AI chạy trên Cloudflare Workers AI đánh dấu nội dung có thể là spam hoặc lạm dụng để người duyệt xem xét, và mọi quyết định công bố đều do con người đưa ra (lợi ích chính đáng)\n• Đo lường lưu lượng tổng hợp và hiển thị thống kê lưu lượng cho chủ sản phẩm (lợi ích chính đáng)\n• Lưu hồ sơ theo yêu cầu pháp luật, ví dụ về thuế (nghĩa vụ pháp lý)\n\nChúng tôi chỉ gửi email marketing khi bạn đồng ý nhận, và bạn có thể hủy đăng ký bất kỳ lúc nào.",
        },
        {
          heading: "4. Ai xử lý dữ liệu của bạn",
          content:
            "Chúng tôi chỉ chia sẻ dữ liệu cá nhân với các nhà cung cấp giúp vận hành dịch vụ, theo thỏa thuận giới hạn mục đích sử dụng:\n• Cloudflare: lưu trữ và phân phối nội dung (Workers), cơ sở dữ liệu (D1), lưu trữ tệp (R2), lưu trữ key-value, hàng đợi, kiểm duyệt AI (Workers AI), chống bot (Turnstile) và phát video khóa học (Stream)\n• Polar: merchant of record cho thanh toán, gói đăng ký, hóa đơn và thuế\n• Resend: gửi mã đăng nhập và email giao dịch\n• Google và GitHub: đăng nhập, chỉ khi bạn chọn\n• Google Analytics 4 (Google LLC) và PostHog: phân tích website tổng hợp\n• ClickHouse: thống kê lưu lượng sản phẩm cho thư mục Build with Us, lưu với mã khách truy cập đã băm\n• Discord: cấp vai trò thành viên khi bạn liên kết Discord\n\nCông khai theo thiết kế: hồ sơ builder công khai, sản phẩm đã công bố, số lượt bình chọn và vị trí trên bảng xếp hạng được mọi người nhìn thấy.\n\nChúng tôi không bán hay cho thuê dữ liệu cá nhân. Chúng tôi có thể tiết lộ dữ liệu khi pháp luật yêu cầu hoặc để bảo vệ quyền và sự an toàn của thành viên.",
        },
        {
          heading: "5. Phân tích",
          content:
            "Google Analytics:\n• Chúng tôi dùng Google Analytics 4 (Google LLC) để đo lường tổng hợp cách website được sử dụng. Công cụ này đặt cookie bên thứ nhất _ga và _ga_<container-id>, lưu tối đa 2 năm (xem Chính sách cookie).\n• Chúng tôi không tải Google Analytics khi trình duyệt của bạn gửi tín hiệu Do Not Track hoặc Global Privacy Control. Bạn cũng có thể từ chối bằng tiện ích trình duyệt Google Analytics Opt-out.\n• Chúng tôi không dùng cookie quảng cáo.\n\nSố liệu lưu lượng của chúng tôi:\n• Số liệu lưu lượng sản phẩm và thư mục không dùng cookie. Trình duyệt giữ một mã ngẫu nhiên trong session storage, bị xóa khi bạn đóng tab.\n• Mã này được băm với khóa bí mật trước khi lưu lưu lượng sản phẩm, và chỉ ghi lại đường dẫn trang, nguồn giới thiệu và lượt bấm liên kết sản phẩm.\n• Các trang đăng nhập, tài khoản, hồ sơ, OAuth, trang thanh toán thành công và bản xem trước Studio không bao giờ được tính.\n• Nếu trình duyệt gửi tín hiệu Do Not Track hoặc Global Privacy Control, các số liệu này cũng được bỏ qua.",
        },
        {
          heading: "6. Chuyển dữ liệu ra nước ngoài",
          content:
            "Các nhà cung cấp có thể xử lý dữ liệu ở quốc gia khác với nơi bạn sống, bao gồm Hoa Kỳ và Liên minh châu Âu. Khi cần thiết, việc chuyển dữ liệu dựa trên các biện pháp bảo vệ như Điều khoản hợp đồng tiêu chuẩn của Ủy ban châu Âu.",
        },
        {
          heading: "7. Thời gian lưu trữ",
          content:
            "• Dữ liệu tài khoản, hồ sơ và nội dung: trong thời gian tài khoản còn hoạt động. Khi bạn yêu cầu xóa tài khoản, chúng tôi xóa hoặc ẩn danh trong vòng 30 ngày, trừ bản sao lưu sẽ hết hạn theo chu kỳ thông thường.\n• Hồ sơ mua hàng: theo thời hạn luật thuế và kế toán yêu cầu.\n• Mã đăng nhập: vài phút. Phiên đã hết hạn: được xóa sau khi kết thúc.\n• Thống kê lưu lượng: lưu ở dạng tổng hợp hoặc bí danh để chủ sản phẩm xem lịch sử.\n• Nhật ký bảo mật: chỉ lưu trong thời gian cần thiết để điều tra lạm dụng.",
        },
        {
          heading: "8. Quyền của bạn",
          content:
            "Tùy nơi bạn sinh sống, bạn có thể yêu cầu:\n• truy cập bản sao dữ liệu cá nhân;\n• sửa dữ liệu không chính xác;\n• xóa dữ liệu;\n• nhận dữ liệu ở định dạng có thể chuyển đổi;\n• phản đối hoặc hạn chế xử lý dựa trên lợi ích chính đáng;\n• rút lại sự đồng ý khi chúng tôi dựa vào sự đồng ý đó.\n\nGửi email tới hello@nextlevelbuilder.io từ địa chỉ email của tài khoản. Chúng tôi phản hồi trong 30 ngày và có thể cần xác minh danh tính. Bạn cũng có thể khiếu nại tới cơ quan bảo vệ dữ liệu tại nơi bạn sống.",
        },
        {
          heading: "9. Bảo mật",
          content:
            "Chúng tôi dùng HTTPS ở mọi nơi, băm khóa API, giới hạn OAuth token trong phạm vi quyền bạn cấp, phục vụ tệp riêng tư qua liên kết có chữ ký và thời hạn, và chỉ cấp quyền truy cập cho nhân sự ở mức cần thiết. Không hệ thống nào an toàn tuyệt đối; nếu xảy ra sự cố ảnh hưởng đến bạn, chúng tôi sẽ thông báo theo quy định pháp luật.",
        },
        {
          heading: "10. Trẻ em",
          content:
            "Dịch vụ không dành cho người dưới 16 tuổi và chúng tôi không cố ý thu thập dữ liệu của họ. Nếu bạn cho rằng một trẻ em đã cung cấp dữ liệu cá nhân cho chúng tôi, hãy liên hệ để chúng tôi xóa.",
        },
        {
          heading: "11. Thay đổi và liên hệ",
          content:
            "Chúng tôi sẽ cập nhật chính sách khi cách xử lý dữ liệu thay đổi và hiển thị ngày cập nhật mới ở đầu trang. Với thay đổi quan trọng, chúng tôi cũng thông báo qua email hoặc trên website.\n\nNext Level Builders · nextlevelbuilder.io · hello@nextlevelbuilder.io",
        },
      ],
    },
  },
};
