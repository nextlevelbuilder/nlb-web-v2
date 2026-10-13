import type { PolicyEntry } from "./policy-types";

/** Community policy ported verbatim from the original site (messages.policies["membership-tiers"]). */
export const membershipTiersPolicy: PolicyEntry = {
  group: "community",
  lastUpdated: "2026-10-13",
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
          content:
            "• Apprentice (Gray): Auto-assigned when joining (0–45 days)\n• Builder (Green): >45 days, ≥8 SHIPs, ≥80% feedback, ≥4 weekly check-ins\n• Architect (Blue): >90 days, ≥20 SHIPs, ≥90% feedback, helped ≥5 members, ≥2 highlighted posts\n• Master (Purple): >6 months, ≥50 SHIPs, ≥95% feedback, Featured/Contributor\n• Legend (Gold): >1 year, ≥100 SHIPs, nominated by ≥2 Mentors — max 5% of members",
        },
        {
          heading: "Ranking Points System",
          content:
            "• SHIP a post: +10 RP\n• SHIP gets highlighted: +25 RP\n• Feedback weekly: +5 RP/week\n• Active in Discord (week): +3 RP/week\n• Help member (verified): +8 RP/time\n• Featured contributor: +50 RP/instance\n• Contributor work: +15 RP/week\n• Product launch: +100 RP\n\nRank thresholds: Builder 100 RP | Architect 300 RP | Master 800 RP | Legend 2000 RP + Nomination",
        },
        {
          heading: "Upgrade & Downgrade",
          content:
            "• Type upgrade (Premium → VIP): Any time, pay the difference, effective immediately\n• Ranking: Auto-calculated based on Ranking Points, updated on the 1st of each month\n• No downgrade from achieved ranks (only freeze if inactive)\n• Legend requires annual re-nomination",
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
          content:
            "• Apprentice (Xám): Tự động khi mới tham gia (0–45 ngày)\n• Builder (Xanh lá): >45 ngày, ≥8 SHIP, ≥80% feedback, ≥4 lần check-in hàng tuần\n• Architect (Xanh dương): >90 ngày, ≥20 SHIP, ≥90% feedback, giúp ≥5 members, ≥2 bài highlight\n• Master (Tím): >6 tháng, ≥50 SHIP, ≥95% feedback, Featured/Contributor\n• Legend (Vàng): >1 năm, ≥100 SHIP, được ≥2 Mentors đề cử — tối đa 5% thành viên",
        },
        {
          heading: "Ranking Points System",
          content:
            "• SHIP bài viết: +10 RP\n• SHIP được highlight: +25 RP\n• Feedback weekly: +5 RP/tuần\n• Hoạt động Discord (tuần): +3 RP/tuần\n• Giúp member (verified): +8 RP/lần\n• Đóng góp nổi bật: +50 RP/lần\n• Contributor work: +15 RP/tuần\n• Product launch: +100 RP\n\nNgưỡng hạng: Builder 100 RP | Architect 300 RP | Master 800 RP | Legend 2000 RP + Đề cử",
        },
        {
          heading: "Upgrade & Downgrade",
          content:
            "• Upgrade loại (Premium → VIP): Bất kỳ lúc nào, thanh toán chênh lệch, hiệu lực ngay\n• Ranking: Tự động tính dựa trên Ranking Points, cập nhật ngày 1 mỗi tháng\n• Không downgrade hạng đã đạt (chỉ freeze nếu inactive)\n• Legend cần re-nomination hàng năm",
        },
      ],
    },
  },
};
