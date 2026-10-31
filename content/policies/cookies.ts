import type { PolicyEntry } from "./policy-types";

/**
 * Cookie Policy, written for v2 from what the site actually stores:
 * better-auth session cookies (lib/auth.ts), the next-intl NEXT_LOCALE cookie (1 year, i18n/routing.ts),
 * the next-themes `nlb-theme` localStorage entry (THEME_STORAGE_KEY in components/theme-provider.tsx), the `nlb-sound`
 * entry (lib/site-audio/site-sound-engine.ts), the `nlb_traffic_visitor`
 * sessionStorage entry (lib/traffic-client.ts, no cookies) and the Google
 * Analytics 4 cookies loaded by app/layout.tsx, which must not load gtag when
 * the browser sends Do Not Track or Global Privacy Control, and the referral
 * cookies nlb_aff and nlb_wv set by app/r/[code]/route.ts (skipped under DNT/GPC), and the share-link
 * cookies nlb_wv and nlb_share_ref set by app/api/v1/builder-wrapped/visit/route.ts.
 * LEGAL REVIEW PENDING: not yet reviewed by counsel. Update the tables when a
 * cookie or storage key is added, renamed or removed.
 */
export const cookiesPolicy: PolicyEntry = {
  group: "legal",
  lastUpdated: "2026-10-31",
  legalReviewPending: true,
  content: {
    en: {
      navLabel: "Cookie Policy",
      title: "Cookie Policy",
      summary:
        "The few cookies and browser storage entries nextlevelbuilder.io uses, why they are needed and how to control them.",
      sections: [
        {
          heading: "1. What this policy covers",
          content:
            "Cookies are small files a website stores in your browser. Local storage and session storage are similar browser features. This policy explains which of them nextlevelbuilder.io uses. It is part of our Privacy Policy.",
        },
        {
          heading: "2. Our approach",
          content:
            "We use cookies and storage that are needed to run the site or remember choices you make, plus Google Analytics cookies to measure how the site is used in aggregate. We do not use advertising cookies or sell data collected through cookies.",
        },
        {
          heading: "3. Essential cookies",
          content:
            "• better-auth.session_token (sent as __Secure-better-auth.session_token over HTTPS): keeps you signed in. Lasts up to 7 days and is renewed while you use the site.\n• Short-lived sign-in cookies set by our authentication service during Google, GitHub or email-code sign-in: protect the sign-in flow against forgery. Removed when sign-in completes or within minutes.\n• NEXT_LOCALE: remembers the language you chose (English or Vietnamese). Lasts one year, or until you switch language again.\n• Cloudflare security cookies such as __cf_bm: set by our hosting provider only when it needs to tell people from bots. __cf_bm lasts 30 minutes.\n\nThese cookies are first-party (or set by Cloudflare acting for us) and are not used to track you across other websites.",
        },
        {
          heading: "4. Browser storage",
          content:
            "• nlb-theme (local storage): remembers whether you prefer the system, light or dark theme. Stays until you clear your browser data.\n• nlb-sound (local storage): remembers whether you turned the background music and sound effects on or off. Stays until you clear your browser data.\n• nlb_traffic_visitor (session storage): a random ID used to count page views without cookies. Deleted when you close the tab, and never created when your browser sends Do Not Track or Global Privacy Control.",
        },
        {
          heading: "5. Analytics cookies",
          content:
            "Google Analytics 4 (provided by Google LLC) measures aggregate site usage, such as which pages are visited and how visitors arrive:\n• _ga: first-party analytics cookie that distinguishes visitors. Kept for up to 2 years.\n• _ga_<container-id>: first-party analytics cookie that keeps the state of a visit. Kept for up to 2 years.\n\nWe do not load Google Analytics when your browser sends Do Not Track or Global Privacy Control. You can also opt out with Google's Analytics opt-out browser add-on (tools.google.com/dlpage/gaoptout).\n\nPostHog (provided by PostHog Inc.) measures product usage on nextlevelbuilder.io, including session replays with typed input masked:\n• ph_<project-key>_posthog: first-party analytics cookie that keeps an anonymous visitor ID (or your account ID when signed in) and the current session. Kept for up to 1 year.\n• PostHog also keeps short-lived replay and queue data in your browser's local and session storage.\n\nPostHog does not load when your browser sends Do Not Track or Global Privacy Control.\n\nOur own product traffic counts set no cookies: they use the session-storage ID above, which is hashed before product statistics are stored and is sent through our own servers. Private pages such as sign-in, account and profile are never counted there.",
        },
        {
          heading: "6. Referral cookies",
          content:
            "Set only when you open an affiliate's referral link (nextlevelbuilder.io/r/<code>):\n• nlb_aff: remembers which referral link brought you, so the affiliate is credited and its member discount applies if you buy a first membership. Lasts 30 days. Not readable by scripts.\n• nlb_wv: a random visitor ID used to count unique clicks on referral links. Lasts 30 days. We store only a salted hash of it, never the ID itself.\n\nNeither cookie is set when your browser sends Do Not Track or Global Privacy Control. You can still buy through the link; the referral then applies only while the link is open in that visit.\n\nWhen you open a member's shared Year in Review page (/wrapped/<year>/<link>):\n• nlb_wv: the same random visitor ID, used to count unique visits to that shared page. Lasts 30 days. We store only a salted hash of it.\n• nlb_share_ref: remembers which shared page brought you, so the member is credited if you create an account. Lasts 30 days. Not readable by scripts.",
        },
        {
          heading: "7. Third-party pages",
          content:
            "When you check out on Polar (polar.sh) or sign in on Google or GitHub, you are on their pages and their own cookie policies apply.",
        },
        {
          heading: "8. Managing cookies",
          content:
            "You can view and delete cookies and site data in your browser settings. If you block essential cookies, signing in will not work, and the site will fall back to your browser's language and theme settings.",
        },
        {
          heading: "9. Changes and contact",
          content:
            "If we add or change a cookie, we will update this page and its date first.\n\nNext Level Builders · nextlevelbuilder.io · hello@nextlevelbuilder.io",
        },
      ],
    },
    vi: {
      navLabel: "Chính sách cookie",
      title: "Chính sách cookie",
      summary:
        "Số ít cookie và dữ liệu lưu trong trình duyệt mà nextlevelbuilder.io sử dụng, lý do cần thiết và cách kiểm soát.",
      sections: [
        {
          heading: "1. Phạm vi chính sách",
          content:
            "Cookie là tệp nhỏ website lưu trong trình duyệt của bạn. Local storage và session storage là các tính năng tương tự của trình duyệt. Chính sách này giải thích nextlevelbuilder.io dùng những gì trong số đó, và là một phần của Chính sách quyền riêng tư.",
        },
        {
          heading: "2. Cách tiếp cận của chúng tôi",
          content:
            "Chúng tôi dùng cookie và bộ nhớ trình duyệt cần thiết để vận hành website hoặc ghi nhớ lựa chọn của bạn, cùng cookie Google Analytics để đo lường tổng hợp cách website được sử dụng. Chúng tôi không dùng cookie quảng cáo và không bán dữ liệu thu thập qua cookie.",
        },
        {
          heading: "3. Cookie thiết yếu",
          content:
            "• better-auth.session_token (gửi dưới tên __Secure-better-auth.session_token qua HTTPS): duy trì trạng thái đăng nhập. Tồn tại tối đa 7 ngày và được gia hạn khi bạn sử dụng website.\n• Cookie đăng nhập ngắn hạn do dịch vụ xác thực đặt trong quá trình đăng nhập bằng Google, GitHub hoặc mã email: bảo vệ luồng đăng nhập khỏi giả mạo. Bị xóa khi đăng nhập xong hoặc sau vài phút.\n• NEXT_LOCALE: ghi nhớ ngôn ngữ bạn chọn (tiếng Anh hoặc tiếng Việt). Tồn tại một năm, hoặc đến khi bạn đổi ngôn ngữ.\n• Cookie bảo mật của Cloudflare như __cf_bm: do nhà cung cấp hạ tầng đặt chỉ khi cần phân biệt người dùng với bot. __cf_bm tồn tại 30 phút.\n\nCác cookie này là cookie bên thứ nhất (hoặc do Cloudflare đặt thay mặt chúng tôi) và không dùng để theo dõi bạn trên website khác.",
        },
        {
          heading: "4. Bộ nhớ trình duyệt",
          content:
            "• nlb-theme (local storage): ghi nhớ bạn chọn giao diện theo hệ thống, sáng hay tối. Tồn tại đến khi bạn xóa dữ liệu trình duyệt.\n• nlb-sound (local storage): ghi nhớ bạn đã bật hay tắt nhạc nền và hiệu ứng âm thanh. Tồn tại đến khi bạn xóa dữ liệu trình duyệt.\n• nlb_traffic_visitor (session storage): mã ngẫu nhiên dùng để đếm lượt xem trang mà không cần cookie. Bị xóa khi bạn đóng tab, và không bao giờ được tạo khi trình duyệt gửi tín hiệu Do Not Track hoặc Global Privacy Control.",
        },
        {
          heading: "5. Cookie phân tích",
          content:
            "Google Analytics 4 (do Google LLC cung cấp) đo lường tổng hợp cách website được sử dụng, chẳng hạn trang nào được xem và khách truy cập đến từ đâu:\n• _ga: cookie phân tích bên thứ nhất dùng để phân biệt khách truy cập. Lưu tối đa 2 năm.\n• _ga_<container-id>: cookie phân tích bên thứ nhất lưu trạng thái lượt truy cập. Lưu tối đa 2 năm.\n\nChúng tôi không tải Google Analytics khi trình duyệt của bạn gửi tín hiệu Do Not Track hoặc Global Privacy Control. Bạn cũng có thể từ chối bằng tiện ích trình duyệt Google Analytics Opt-out (tools.google.com/dlpage/gaoptout).\n\nPostHog (do PostHog Inc. cung cấp) đo lường cách sản phẩm được sử dụng trên nextlevelbuilder.io, gồm bản ghi phiên truy cập với nội dung nhập được che:\n• ph_<project-key>_posthog: cookie phân tích bên thứ nhất lưu mã khách truy cập ẩn danh (hoặc ID tài khoản khi bạn đăng nhập) và phiên hiện tại. Lưu tối đa 1 năm.\n• PostHog cũng lưu dữ liệu ngắn hạn cho bản ghi phiên và hàng đợi gửi trong local storage và session storage của trình duyệt.\n\nPostHog không tải khi trình duyệt gửi tín hiệu Do Not Track hoặc Global Privacy Control.\n\nSố liệu lưu lượng sản phẩm của chúng tôi không dùng cookie: chúng dựa trên mã trong session storage nêu trên, được băm trước khi lưu thống kê sản phẩm và được gửi qua máy chủ của chúng tôi. Các trang riêng tư như đăng nhập, tài khoản và hồ sơ không bao giờ được tính ở đó.",
        },
        {
          heading: "6. Cookie giới thiệu",
          content:
            "Chỉ được đặt khi bạn mở liên kết giới thiệu của affiliate (nextlevelbuilder.io/r/<mã>):\n• nlb_aff: ghi nhớ liên kết giới thiệu đã đưa bạn đến, để ghi nhận cho affiliate và áp dụng ưu đãi thành viên của liên kết nếu bạn mua gói thành viên đầu tiên. Tồn tại 30 ngày. Script không đọc được.\n• nlb_wv: mã khách truy cập ngẫu nhiên dùng để đếm lượt nhấp duy nhất vào liên kết giới thiệu. Tồn tại 30 ngày. Chúng tôi chỉ lưu giá trị băm có muối của mã này, không bao giờ lưu mã gốc.\n\nKhông cookie nào trong số này được đặt khi trình duyệt gửi tín hiệu Do Not Track hoặc Global Privacy Control. Bạn vẫn có thể mua qua liên kết; khi đó ưu đãi chỉ áp dụng trong lượt truy cập mở từ liên kết.\n\nKhi bạn mở trang Year in Review do một thành viên chia sẻ (/wrapped/<năm>/<liên-kết>):\n• nlb_wv: cùng mã khách truy cập ngẫu nhiên, dùng để đếm lượt xem duy nhất của trang được chia sẻ. Tồn tại 30 ngày. Chúng tôi chỉ lưu giá trị băm có muối.\n• nlb_share_ref: ghi nhớ trang chia sẻ đã đưa bạn đến, để ghi nhận cho thành viên đó nếu bạn tạo tài khoản. Tồn tại 30 ngày. Script không đọc được.",
        },
        {
          heading: "7. Trang của bên thứ ba",
          content:
            "Khi bạn thanh toán trên Polar (polar.sh) hoặc đăng nhập trên Google hay GitHub, bạn đang ở trang của họ và chính sách cookie riêng của họ được áp dụng.",
        },
        {
          heading: "8. Quản lý cookie",
          content:
            "Bạn có thể xem và xóa cookie cùng dữ liệu website trong phần cài đặt trình duyệt. Nếu chặn cookie thiết yếu, bạn sẽ không đăng nhập được, và website sẽ dùng ngôn ngữ cùng giao diện mặc định của trình duyệt.",
        },
        {
          heading: "9. Thay đổi và liên hệ",
          content:
            "Nếu thêm hoặc thay đổi cookie, chúng tôi sẽ cập nhật trang này và ngày cập nhật trước.\n\nNext Level Builders · nextlevelbuilder.io · hello@nextlevelbuilder.io",
        },
      ],
    },
  },
};
