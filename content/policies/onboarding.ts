import type { PolicyEntry } from "./policy-types";

/** Community policy ported verbatim from the original site (messages.policies["onboarding"]). */
export const onboardingPolicy: PolicyEntry = {
  group: "community",
  lastUpdated: "2026-10-13",
  legalReviewPending: false,
  content: {
    en: {
      navLabel: "Onboarding Process",
      title: "New Member Review Process",
      summary: "How new members are reviewed, the commitments they accept and the first-week checklist.",
      sections: [
        {
          heading: "Process Overview (7–14 days)",
          content:
            "1. Pay membership fee\n2. Submit Member Information Form\n3. Admin Review & Verify (2–3 days)\n4. Submit Commitment Form\n5. Receive Discord Access + Onboarding\n\nNote: If you don't pass the review, you will receive a 100% refund.",
        },
        {
          heading: "Review Criteria",
          content:
            "Admin evaluates based on:\n• Complete information (20%): All required fields filled\n• Verified profile (20%): Verifiable links\n• Clear goals (25%): Knows what they want to build\n• Suitable skills (20%): Has a foundation to build\n• Right motivation (15%): Wants to SHIP and learn — not just lurk",
        },
        {
          heading: "Required Commitments",
          content:
            "• SHIP at least 4 posts/month as public posts, share in #ship\n• Submit Feedback Weekly form EVERY WEEK with substantive content\n• Active Discord participation: at least 2 weekly check-ins/month\n• Follow NLB's Code of Conduct\n• If you don't want to SHIP, apply as a Contributor (requires approval)",
        },
        {
          heading: "Post-Approval Checklist",
          content:
            "• Day 1: Read SHIP guidelines, update Discord profile\n• Day 2: Introduce yourself in #introductions\n• Day 3: Watch the Onboarding Video\n• Day 7: Watch Onboarding Video Pt.2 + complete Onboarding Checklist in Discord\n• Week 2: SHIP your first post\n• Week 2: Submit first Feedback Weekly",
        },
        {
          heading: "Re-application",
          content:
            "Requirements: Previously removed due to violations + waited at least 45 days\n\nProcess:\n1. Submit updated Member Information Form\n2. Explain why you want to return\n3. Specific commitments about what you'll do differently\n4. Admin review (stricter than first time)\n5. If approved: Go through the normal process",
        },
      ],
    },
    vi: {
      navLabel: "Quy trình Onboarding",
      title: "Quy trình xét duyệt thành viên mới",
      summary: "Cách xét duyệt thành viên mới, các cam kết cần đồng ý và checklist tuần đầu.",
      sections: [
        {
          heading: "Tổng quan quy trình (7–14 ngày)",
          content:
            "1. Thanh toán phí membership\n2. Submit Form Thông Tin cá nhân\n3. BQT Review & Verify (2–3 ngày)\n4. Submit Form Cam Kết\n5. Nhận Discord Access + Onboarding\n\nLưu ý: Nếu không đạt xét duyệt, được REFUND 100% chi phí đã đóng.",
        },
        {
          heading: "Tiêu chí xét duyệt",
          content:
            'BQT đánh giá dựa trên:\n• Thông tin đầy đủ (20%): Điền hết các trường bắt buộc\n• Profile thật (20%): Có link xác minh được\n• Mục tiêu rõ ràng (25%): Biết muốn build gì\n• Năng lực phù hợp (20%): Có nền tảng để build\n• Động lực đúng (15%): Muốn SHIP, học hỏi — không chỉ "hóng"',
        },
        {
          heading: "Cam kết cần đồng ý",
          content:
            "• SHIP tối thiểu 4 bài/tháng dưới dạng bài viết public, post vào #ship\n• Submit Form Feedback Weekly MỖI TUẦN với nội dung thực chất\n• Hoạt động Discord tích cực: ít nhất 2 lần check-in hàng tuần/tháng\n• Tuân thủ Code of Conduct của NLB\n• Nếu không muốn SHIP, đăng ký làm Contributor (xét duyệt)",
        },
        {
          heading: "Checklist sau khi được duyệt",
          content:
            "• Ngày 1: Đọc quy chế SHIP, update Discord profile\n• Ngày 2: Giới thiệu bản thân tại #introductions\n• Ngày 3: Xem Onboarding Video\n• Ngày 7: Xem Onboarding Video Phần 2 + hoàn thành Onboarding Checklist trên Discord\n• Tuần 2: SHIP bài đầu tiên\n• Tuần 2: Submit Feedback Weekly đầu tiên",
        },
        {
          heading: "Tái đăng ký (Re-application)",
          content:
            "Điều kiện: Đã bị gỡ quyền do vi phạm + chờ ít nhất 45 ngày\n\nQuy trình:\n1. Submit Form Thông Tin (cập nhật mới)\n2. Giải thích lý do muốn quay lại\n3. Cam kết cụ thể sẽ làm gì khác\n4. BQT review (strict hơn lần đầu)\n5. Nếu approved: đi qua quy trình bình thường",
        },
      ],
    },
  },
};
