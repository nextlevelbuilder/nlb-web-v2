import type { PolicyEntry } from "./policy-types";

/** How a paid membership becomes community access: automatic, from the verified Polar subscription. */
export const onboardingPolicy: PolicyEntry = {
  group: "community",
  lastUpdated: "2026-10-17",
  legalReviewPending: false,
  content: {
    en: {
      navLabel: "Onboarding Process",
      title: "New Member Onboarding",
      summary: "How a Premium or VIP payment becomes Discord and Telegram access, the commitments members accept and the first-week checklist.",
      sections: [
        {
          heading: "Process Overview (about 5 minutes)",
          content:
            "1. Pay for Premium or VIP through Polar\n2. Sign in on nextlevelbuilder.io with the email you paid with\n3. Fill in the short member form and accept the member commitments\n4. Link Discord: you are added to the server with the role for your tier\n5. Link Telegram and send a join request: the bot approves it automatically\n\nThere is no manual review: access is granted as soon as Polar confirms your payment and you have linked your accounts. You can save the form and finish later from the onboarding page or your account.",
        },
        {
          heading: "Member Form",
          content:
            "Required:\n• What you want to build (one or two sentences)\n• Acceptance of the member commitments below\n\nOptional:\n• Up to 3 profile links (GitHub, LinkedIn, X, portfolio)\n• Skills\n• Phone number, used only by the team to reach you about your membership",
        },
        {
          heading: "Required Commitments",
          content:
            "• SHIP at least 4 posts/month as public posts, share in #ship\n• Submit Feedback Weekly form EVERY WEEK with substantive content\n• Active Discord participation: at least 2 weekly check-ins/month\n• Follow NLB's Code of Conduct\n• If you don't want to SHIP, apply as a Contributor (requires approval)",
        },
        {
          heading: "Access Follows Your Subscription",
          content:
            "Discord roles and Telegram group access always match your Polar subscription:\n• Active subscription: access for your tier (VIP wins when you hold both plans)\n• Cancelled at period end: access stays until the paid period ends\n• Payment past due: access stays for a 7-day grace period while Polar retries the payment\n• Expired, revoked or refunded: access is removed automatically\n• Renew any time: link again or press Retry on your account page and access comes back\n\nYour membership never depends on Discord or Telegram: if a community step fails, it is retried automatically and you can retry it yourself from your account page.",
        },
        {
          heading: "First-Week Checklist",
          content:
            "• Day 1: Read SHIP guidelines, update Discord profile\n• Day 2: Introduce yourself in #introductions\n• Day 3: Watch the Onboarding Video\n• Day 7: Watch Onboarding Video Pt.2 + complete Onboarding Checklist in Discord\n• Week 2: SHIP your first post\n• Week 2: Submit first Feedback Weekly",
        },
        {
          heading: "Re-joining After Removal",
          content:
            "Requirements: Previously removed due to violations + waited at least 45 days\n\nProcess:\n1. Email the team explaining why you want to return\n2. Specific commitments about what you'll do differently\n3. Admin review (members removed for violations are the only case reviewed by hand)\n4. If approved: renew your membership and complete onboarding as usual",
        },
      ],
    },
    vi: {
      navLabel: "Quy trình Onboarding",
      title: "Onboarding thành viên mới",
      summary: "Cách khoản thanh toán Premium hoặc VIP trở thành quyền truy cập Discord và Telegram, các cam kết thành viên và checklist tuần đầu.",
      sections: [
        {
          heading: "Tổng quan quy trình (khoảng 5 phút)",
          content:
            "1. Thanh toán gói Premium hoặc VIP qua Polar\n2. Đăng nhập nextlevelbuilder.io bằng email đã thanh toán\n3. Điền form thành viên ngắn và đồng ý với các cam kết thành viên\n4. Liên kết Discord: bạn được thêm vào server với role đúng gói\n5. Liên kết Telegram và gửi yêu cầu vào nhóm: bot tự động duyệt\n\nKhông có bước xét duyệt thủ công: quyền truy cập được cấp ngay khi Polar xác nhận thanh toán và bạn đã liên kết tài khoản. Bạn có thể lưu form và hoàn tất sau từ trang onboarding hoặc trang tài khoản.",
        },
        {
          heading: "Form thành viên",
          content:
            "Bắt buộc:\n• Bạn muốn build gì (một hoặc hai câu)\n• Đồng ý với các cam kết thành viên bên dưới\n\nKhông bắt buộc:\n• Tối đa 3 liên kết hồ sơ (GitHub, LinkedIn, X, portfolio)\n• Kỹ năng\n• Số điện thoại, chỉ dùng để đội ngũ liên hệ với bạn về membership",
        },
        {
          heading: "Cam kết cần đồng ý",
          content:
            "• SHIP tối thiểu 4 bài/tháng dưới dạng bài viết public, post vào #ship\n• Submit Form Feedback Weekly MỖI TUẦN với nội dung thực chất\n• Hoạt động Discord tích cực: ít nhất 2 lần check-in hàng tuần/tháng\n• Tuân thủ Code of Conduct của NLB\n• Nếu không muốn SHIP, đăng ký làm Contributor (xét duyệt)",
        },
        {
          heading: "Quyền truy cập đi theo subscription",
          content:
            "Role Discord và quyền vào nhóm Telegram luôn khớp với subscription Polar của bạn:\n• Subscription đang hoạt động: có quyền theo gói (nếu có cả hai gói, VIP được ưu tiên)\n• Huỷ vào cuối kỳ: giữ quyền đến hết kỳ đã thanh toán\n• Quá hạn thanh toán: giữ quyền thêm 7 ngày trong lúc Polar thử thu lại\n• Hết hạn, bị thu hồi hoặc đã hoàn tiền: quyền truy cập tự động bị gỡ\n• Gia hạn bất cứ lúc nào: liên kết lại hoặc bấm Thử lại ở trang tài khoản để có lại quyền\n\nMembership của bạn không phụ thuộc vào Discord hay Telegram: nếu một bước cộng đồng lỗi, hệ thống tự thử lại và bạn cũng có thể tự thử lại ở trang tài khoản.",
        },
        {
          heading: "Checklist tuần đầu",
          content:
            "• Ngày 1: Đọc quy chế SHIP, update Discord profile\n• Ngày 2: Giới thiệu bản thân tại #introductions\n• Ngày 3: Xem Onboarding Video\n• Ngày 7: Xem Onboarding Video Phần 2 + hoàn thành Onboarding Checklist trên Discord\n• Tuần 2: SHIP bài đầu tiên\n• Tuần 2: Submit Feedback Weekly đầu tiên",
        },
        {
          heading: "Quay lại sau khi bị gỡ quyền",
          content:
            "Điều kiện: Đã bị gỡ quyền do vi phạm + chờ ít nhất 45 ngày\n\nQuy trình:\n1. Email cho đội ngũ, giải thích lý do muốn quay lại\n2. Cam kết cụ thể sẽ làm gì khác\n3. BQT review (trường hợp bị gỡ do vi phạm là trường hợp duy nhất được xét thủ công)\n4. Nếu được duyệt: gia hạn membership và hoàn tất onboarding như bình thường",
        },
      ],
    },
  },
};
