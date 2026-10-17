import type { PolicyEntry } from "./policy-types";

/** Community policy ported verbatim from the original site (messages.policies["violations"]). */
export const violationsPolicy: PolicyEntry = {
  group: "community",
  lastUpdated: "2026-10-13",
  legalReviewPending: false,
  content: {
    en: {
      navLabel: "Violation Policy",
      title: "Violation Policy",
      summary: "How commitment and conduct violations are handled, community refunds and the right to appeal.",
      sections: [
        {
          heading: "General Principles",
          content:
            'NLB follows a "Fair but Firm" policy — fair to all members, but serious about commitments.\n\n"We don\'t want to remove anyone. We want everyone to SHIP."',
        },
        {
          heading: "Types of Violations",
          content:
            'SHIP violations:\n• Minor: 2–3 posts/month\n• Moderate: 1 post/month\n• Severe: No posts at all\n• Critical: No posts for 2 consecutive months\n\nFeedback violations:\n• Minor: Miss 1–2 weeks/month\n• Severe: No submissions for the whole month or fake submissions (".", "ok", spam)\n\nCode of Conduct violations:\n• Spam, off-topic, disrespectful behavior\n• Causing conflict, toxic behavior\n• Harassment, discrimination',
        },
        {
          heading: "Automated Enforcement Process",
          content:
            "The system automatically tracks SHIP count, feedback submissions, and consolidates every 45 days.\n\nAt review time:\n• Pass: Sufficient SHIP + Feedback + Discord activity → Membership continues\n• Fail: Auto-revoke Discord access, revoke credentials, send notification email, process 100% Refund, add to 45-day waiting list",
        },
        {
          heading: "Fast Track (Immediate Action)",
          content:
            "Some violations are handled immediately without warning:\n• Harassing other members → Immediate termination\n• Spam, advertising, scam → Terminate + Permanent ban\n• Violating laws → Terminate + Report if needed\n• Fake identity → Terminate + Permanent ban\n• Leaking internal information → Terminate + Legal review",
        },
        {
          heading: "Refund Policy",
          content:
            "100% Refund when:\n• Terminated due to commitment violations\n• Voluntarily leaving within the first 45 days\n• NLB ceases operations\n\nPro-rata refund: Voluntarily leaving after 45 days (based on remaining time)\n\nNo refund: Permanently banned due to serious violations, or membership period has ended",
        },
        {
          heading: "Right to Appeal",
          content:
            "If you believe the decision was unfair:\n1. Reply to the termination email with your appeal reason\n2. Admin reviews within 7 days\n3. If unsatisfied, escalate to Co-founders\n4. Final decision within 14 days\n\nRequired: Specific reason for appeal, evidence (if any), proposed resolution",
        },
      ],
    },
    vi: {
      navLabel: "Xử lý vi phạm",
      title: "Chính sách xử lý vi phạm",
      summary: "Cách xử lý vi phạm cam kết và quy tắc ứng xử, hoàn tiền trong cộng đồng và quyền khiếu nại.",
      sections: [
        {
          heading: "Nguyên tắc chung",
          content:
            'NLB áp dụng chính sách "Fair but Firm" — công bằng với tất cả thành viên, nhưng nghiêm túc với cam kết.\n\n"Chúng tôi không muốn kick ai. Chúng tôi muốn tất cả cùng SHIP."',
        },
        {
          heading: "Các loại vi phạm",
          content:
            'Vi phạm SHIP:\n• Nhẹ: SHIP 2–3 bài/tháng\n• Trung bình: SHIP 1 bài/tháng\n• Nặng: Không SHIP bài nào\n• Nghiêm trọng: Không SHIP 2 tháng liên tiếp\n\nVi phạm Feedback:\n• Nhẹ: Miss 1–2 tuần/tháng\n• Nặng: Không submit cả tháng hoặc điền đại (".", "ok", spam)\n\nVi phạm Code of Conduct:\n• Spam, off-topic, không tôn trọng\n• Gây conflict, toxic behavior\n• Quấy rối, phân biệt đối xử',
        },
        {
          heading: "Quy trình xử lý tự động",
          content:
            "Hệ thống tự động theo dõi SHIP count, feedback submissions và tổng hợp theo chu kỳ 45 ngày.\n\nKhi đến hạn review:\n• Đạt: Đủ SHIP + Feedback + Hoạt động Discord → Tiếp tục membership\n• Không đạt: Tự động gỡ quyền Discord, revoke credentials, gửi email thông báo, xử lý Refund 100%, ghi nhận danh sách chờ 45 ngày",
        },
        {
          heading: "Xử lý nhanh (Fast Track)",
          content:
            "Một số vi phạm được xử lý ngay lập tức không qua warning:\n• Quấy rối thành viên khác → Terminate ngay\n• Spam quảng cáo, scam → Terminate + Ban vĩnh viễn\n• Vi phạm pháp luật → Terminate + Báo cáo nếu cần\n• Fake identity → Terminate + Ban vĩnh viễn\n• Leak thông tin nội bộ → Terminate + Xem xét pháp lý",
        },
        {
          heading: "Chính sách Refund",
          content:
            "Refund 100% khi:\n• Bị terminate do vi phạm cam kết\n• Tự rời đi trong 45 ngày đầu\n• NLB ngừng hoạt động\n\nRefund pro-rata: Tự rời đi sau 45 ngày (tính theo thời gian còn lại)\n\nKhông refund: Bị ban vĩnh viễn do vi phạm nghiêm trọng, hoặc đã hết thời gian membership",
        },
        {
          heading: "Quyền khiếu nại",
          content:
            "Nếu bạn cho rằng quyết định không công bằng:\n1. Reply email terminate với lý do khiếu nại\n2. BQT review trong 7 ngày\n3. Nếu chưa hài lòng, escalate lên Co-founders\n4. Quyết định cuối cùng trong 14 ngày\n\nCần cung cấp: Lý do khiếu nại cụ thể, bằng chứng (nếu có), đề xuất giải quyết",
        },
      ],
    },
  },
};
