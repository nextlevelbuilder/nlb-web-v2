import type { PolicyEntry } from "./policy-types";

/** Community policy ported verbatim from the original site (messages.policies["contributor-policy"]). */
export const contributorPolicy: PolicyEntry = {
  group: "community",
  lastUpdated: "2026-10-13",
  legalReviewPending: false,
  content: {
    en: {
      navLabel: "Contributor Policy",
      title: "Contributor Policy",
      summary: "The alternative path for members who build the community instead of shipping weekly.",
      sections: [
        {
          heading: "What is a Contributor?",
          content:
            "A Contributor is an NLB member who helps build the community instead of shipping personal content weekly. This is an alternative path for those who don't want or can't Build in Public but still want to contribute value.",
        },
        {
          heading: "Types of Contributors",
          content:
            "• Technical Support: Answer technical questions on Discord, help with debugging, review code, share resources\n• Developer: Fix bugs, implement features, update docs, code review — requires assessment by 3 Mentors; commit 4–8 hours/week\n• Other: Content, Community, QA/Testing, Design, Research — propose your own contribution format",
        },
        {
          heading: "Application Process",
          content:
            "1. Be a paid NLB member\n2. Submit Contributor Application Form\n3. Mentor review (Developer: thorough assessment, 3–7 days)\n4. If approved: Begin 45-day trial period\n5. Choose how to contribute + submit weekly reports\n6. Mentors conduct overall review\n7. Result: CONFIRM, EXTEND, or REMOVE + Refund",
        },
        {
          heading: "45-Day Trial Period",
          content:
            "• Choose tasks/contributions that match your skills\n• Submit work report EVERY WEEK (mandatory)\n• Still required to submit Feedback Weekly form\n• SHIP 4 posts/month requirement is waived during this period",
        },
        {
          heading: "Confirmed Contributor Benefits",
          content:
            "• Contributor badge on Discord\n• SHIP requirement waived\n• +15 RP/week of work\n• Early access to NLB products\n• Connect with Mentors and Partners\n• Reference letter from NLB when needed\n• Revenue share from contributed projects (case by case)",
        },
        {
          heading: "Strategic Partner Privileges",
          content:
            "For outstanding individuals who are both active Contributors and consistent Shippers:\n• Priority to distribute AgentBrain.sh and GoClaw.sh with profit sharing\n• Support for packaging your own product based on NLB platforms\n• Join strategic meetings with Founders (Co-founder Level Access)",
        },
      ],
    },
    vi: {
      navLabel: "Quy chế Contributor",
      title: "Quy chế Contributor",
      summary: "Con đường thay thế cho thành viên đóng góp xây dựng cộng đồng thay vì SHIP hàng tuần.",
      sections: [
        {
          heading: "Contributor là gì?",
          content:
            "Contributor là thành viên NLB đóng góp xây dựng cộng đồng thay vì SHIP nội dung cá nhân hàng tuần. Đây là lựa chọn thay thế cho những ai không muốn/không thể Build in Public nhưng vẫn muốn đóng góp giá trị.",
        },
        {
          heading: "Các loại Contributor",
          content:
            "• Technical Support: Trả lời câu hỏi kỹ thuật trên Discord, hướng dẫn debug, review code, chia sẻ resources\n• Developer: Fix bugs, implement features, update docs, code review — cần được 3 Mentors thẩm định trình độ; cam kết 4–8 giờ/tuần\n• Other: Content, Community, QA/Testing, Design, Research — tự đề xuất hình thức đóng góp",
        },
        {
          heading: "Quy trình đăng ký",
          content:
            "1. Là thành viên trả phí NLB\n2. Submit Contributor Application Form\n3. Mentors review (Developer: thẩm định kỹ, 3–7 ngày)\n4. Nếu approved: Bắt đầu thử việc 45 ngày\n5. Tự chọn cách contribute + Báo cáo weekly\n6. Mentors review tổng thể\n7. Kết quả: CONFIRM, EXTEND, hoặc REMOVE + Refund",
        },
        {
          heading: "Thử việc 45 ngày",
          content:
            "• Tự chọn tasks/contributions phù hợp năng lực\n• Báo cáo công việc MỖI TUẦN (bắt buộc)\n• Vẫn phải submit Feedback Weekly form\n• Miễn yêu cầu SHIP 4 bài/tháng trong giai đoạn này",
        },
        {
          heading: "Quyền lợi Contributor chính thức",
          content:
            "• Badge Contributor trên Discord\n• Miễn SHIP 4 bài/tháng\n• +15 RP/tuần công việc\n• Early Access sản phẩm NLB\n• Kết nối với Mentors và Partners\n• Thư giới thiệu từ NLB khi cần\n• Revenue share từ dự án đóng góp (tùy case)",
        },
        {
          heading: "Đặc quyền Đối tác Chiến lược",
          content:
            "Dành cho cá nhân xuất sắc vừa là Contributor tích cực vừa SHIP đều đặn:\n• Ưu tiên phân phối AgentBrain.sh và GoClaw.sh với chia sẻ lợi nhuận\n• Hỗ trợ đóng gói sản phẩm riêng dựa trên nền tảng NLB\n• Tham gia các buổi họp chiến lược với Founders (Co-founder Level Access)",
        },
      ],
    },
  },
};
