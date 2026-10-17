import { describeRankGates, describeRpTable, rulesetNotice } from "@/lib/builder-league/ruleset/policy-text";
import type { PolicyEntry } from "./policy-types";

/** Community policy ported verbatim from the original site (messages.policies["membership-tiers"]); RP and rank text follows Builder League ruleset v2. */
export const membershipTiersPolicy: PolicyEntry = {
  group: "community",
  lastUpdated: "2026-10-17",
  legalReviewPending: false,
  content: {
    en: {
      navLabel: "Membership Tiers",
      title: "Membership Types & Ranks",
      summary: "Premium and VIP benefits, the five ranks and how Ranking Points are earned.",
      sections: [
        {
          heading: "Two Independent Systems",
          content:
            "NLB has 2 independent classification systems:\n• Membership Type: Based on subscription plan — Premium or VIP\n• Member Rank: Based on contributions and activity — Apprentice to Legend",
        },
        {
          heading: "Premium Member",
          content:
            "For Builders who want to learn, connect, and SHIP in a professional environment.\n\nBenefits:\n• Discord Access: All Premium channels\n• Weekly Drops: Full access to weekly content drops in the library\n• Resources: Templates, tools, guides\n• Community: Network with 30+ builders\n• Async Q&A: Priority answers from Mentors in Discord\n• Product Access: Access to NLB products",
        },
        {
          heading: "VIP Member",
          content:
            "For serious Builders who want to accelerate and have the opportunity to become a Partner.\n\nBenefits = Premium + Priority:\n• Early Access: First access to all new products\n• Early Bird Slots: Priority pricing on new programs\n• Partner Priority: Priority review to become Strategic Partner\n• Priority Mentor DM: Direct Discord DM with Mentor (priority queue)\n• Direct Access: Chat directly with Mentors\n• Co-launch: Opportunity for editorial collaboration on product launches based on community relevance",
        },
        {
          heading: "5-Tier Ranking System",
          content: `A rank is reached when every condition of that rank and of all lower ranks is met. Membership type (Premium or VIP) never changes your rank or your RP.\n${describeRankGates("en")}`,
        },
        {
          heading: "Ranking Points System",
          content: `RP is earned only for verified activity. SHIP events and every award of 25 RP or more are verified by a moderator or by the system; help to a member is confirmed by the person you helped.\n\n${describeRpTable("en")}`,
        },
        {
          heading: "Upgrade & Downgrade",
          content:
            "• Type upgrade (Premium → VIP): Any time, pay the difference, effective immediately\n• Ranking: Calculated automatically from your verified RP and the conditions above\n• No automatic downgrade: a rank you have reached is kept (inactive members are only frozen)\n• Legend requires annual re-nomination by Mentors",
        },
        {
          heading: "Rules Version",
          content: rulesetNotice("en"),
        },
      ],
    },
    vi: {
      navLabel: "Hạng thành viên",
      title: "Phân loại & Hạng thành viên",
      summary: "Quyền lợi Premium và VIP, năm hạng thành viên và cách tích lũy Ranking Points.",
      sections: [
        {
          heading: "Hai hệ thống độc lập",
          content:
            "NLB có 2 hệ thống phân loại hoạt động độc lập:\n• Loại thành viên (Membership Type): Dựa trên gói đăng ký & thanh toán — Premium hoặc VIP\n• Hạng thành viên (Member Rank): Dựa trên đóng góp & hoạt động — Apprentice đến Legend",
        },
        {
          heading: "Premium Member",
          content:
            "Dành cho Builders muốn học hỏi, kết nối và SHIP trong môi trường chuyên nghiệp.\n\nQuyền lợi:\n• Discord Access: Tất cả channels Premium\n• Drops Hàng Tuần: Truy cập đầy đủ nội dung mới được drop hàng tuần\n• Resources: Templates, tools, guides\n• Community: Network với 30+ builders\n• Q&A bất đồng bộ: Ưu tiên trả lời từ Mentors trên Discord\n• Product Access: Truy cập sản phẩm NLB",
        },
        {
          heading: "VIP Member",
          content:
            "Dành cho Builders nghiêm túc muốn accelerate và có cơ hội trở thành Partner.\n\nQuyền lợi = Premium + Ưu tiên:\n• Early Access: First access mọi sản phẩm mới\n• Early Bird Slots: Ưu tiên suất giá tốt\n• Partner Priority: Ưu tiên xét duyệt làm Đối tác Chiến lược\n• Mentor DM ưu tiên: Nhắn riêng Mentor trên Discord (hàng ưu tiên)\n• Direct Access: Chat trực tiếp với Mentors\n• Co-launch: Cơ hội hợp tác biên tập ra mắt sản phẩm dựa trên độ phù hợp với cộng đồng",
        },
        {
          heading: "Hệ thống 5 Hạng",
          content: `Bạn đạt một hạng khi đáp ứng mọi điều kiện của hạng đó và của tất cả các hạng thấp hơn. Loại thành viên (Premium hay VIP) không ảnh hưởng đến hạng hay RP của bạn.\n${describeRankGates("vi")}`,
        },
        {
          heading: "Ranking Points System",
          content: `RP chỉ được cộng cho hoạt động đã xác minh. Các hoạt động SHIP và mọi khoản từ 25 RP trở lên do moderator hoặc hệ thống xác minh; việc giúp đỡ thành viên cần chính người được giúp xác nhận.\n\n${describeRpTable("vi")}`,
        },
        {
          heading: "Upgrade & Downgrade",
          content:
            "• Upgrade loại (Premium → VIP): Bất kỳ lúc nào, thanh toán chênh lệch, hiệu lực ngay\n• Ranking: Tự động tính từ RP đã xác minh và các điều kiện ở trên\n• Không tự động hạ hạng: hạng đã đạt được giữ nguyên (chỉ freeze nếu inactive)\n• Legend cần được Mentor đề cử lại hàng năm",
        },
        {
          heading: "Phiên bản quy tắc",
          content: rulesetNotice("vi"),
        },
      ],
    },
  },
};
