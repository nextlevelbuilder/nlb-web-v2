import { describeRankGates, rulesetNotice } from "@/lib/builder-league/ruleset/policy-text";
import type { PolicyEntry } from "./policy-types";

/** Community policy ported verbatim from the original site (messages.policies["overview"]); RP and rank text follows Builder League ruleset v2. */
export const communityOverviewPolicy: PolicyEntry = {
  group: "community",
  lastUpdated: "2026-10-17",
  legalReviewPending: false,
  content: {
    en: {
      navLabel: "Overview",
      title: "NLB Community Guidelines Overview",
      summary:
        "How the community works: two ways to join, two membership types, ranks and the commitments every member makes.",
      sections: [
        {
          heading: "Vision & Mission",
          content:
            "NextLevelBuilder (NLB) is a community of hands-on Builders — where every member actively SHIPs (publishes products, content, and value to the world) or CONTRIBUTEs (builds the community).\n\n\"No Ship, No Seat\" — If you don't ship, you don't have a seat in the community.",
        },
        {
          heading: "Two Paths to Join",
          content:
            "• SHIP: Commit to 4 public posts/month, share in Discord #ship — for those who want to Build in Public\n• CONTRIBUTE: 45-day trial period, weekly reports — for those who want to contribute technically or to the community",
        },
        {
          heading: "Two Membership Types",
          content:
            "• Premium: Full standard benefits — Discord, content drops, resources, community support\n• VIP: Premium + priority slots, early access, priority Discord DM with Mentor, direct Mentor access",
        },
        {
          heading: "Ranking System",
          content: `Rank is based on verified contributions and is independent from membership type. A rank you reach is never downgraded automatically:\n${describeRankGates("en")}`,
        },
        {
          heading: "Required Commitments",
          content:
            "• Complete personal information (verified by admin)\n• Submit Feedback Weekly every week\n• Read and agree to all community guidelines\n• SHIP at least 4 public posts/month OR be approved as a Contributor",
        },
        {
          heading: "Ranking Points (RP)",
          content: `RP rewards verified progress across four stages: VALIDATE, BUILD, SHIP and CONTRIBUTE. The full RP table, with the limits of each activity, is in the Membership Types & Ranks policy.\n\n${rulesetNotice("en")}`,
        },
      ],
    },
    vi: {
      navLabel: "Tổng quan",
      title: "Tổng quan Quy chế NLB",
      summary:
        "Cách cộng đồng vận hành: hai đường tham gia, hai loại thành viên, hệ thống hạng và các cam kết bắt buộc.",
      sections: [
        {
          heading: "Tầm nhìn & Sứ mệnh",
          content:
            'NextLevelBuilder (NLB) là cộng đồng Builders thực chiến — nơi mọi thành viên đều tích cực SHIP (công bố sản phẩm, nội dung, giá trị ra thế giới) hoặc CONTRIBUTE (đóng góp xây dựng cộng đồng).\n\n"No Ship, No Seat" — Không SHIP, không có chỗ trong cộng đồng.',
        },
        {
          heading: "Hai đường tham gia",
          content:
            "• SHIP: Cam kết 4 bài/tháng public, post #ship vào Discord — dành cho ai muốn Build in Public\n• CONTRIBUTE: Thử việc 45 ngày, báo cáo weekly — dành cho ai muốn đóng góp kỹ thuật hoặc cộng đồng",
        },
        {
          heading: "Hai loại thành viên",
          content:
            "• Premium: Đầy đủ quyền lợi chuẩn — Discord, content drops, resources, community support\n• VIP: Premium + ưu tiên slots, early access, Discord DM ưu tiên với Mentor, direct access Mentors",
        },
        {
          heading: "Hệ thống Hạng (Ranking)",
          content: `Hạng dựa trên đóng góp đã xác minh và độc lập với loại thành viên. Hạng đã đạt sẽ không bao giờ bị tự động hạ:\n${describeRankGates("vi")}`,
        },
        {
          heading: "Cam kết bắt buộc",
          content:
            "• Điền đầy đủ thông tin cá nhân (verify bởi BQT)\n• Submit Feedback Weekly mỗi tuần\n• Đọc hiểu và đồng ý toàn bộ quy chế\n• SHIP tối thiểu 4 bài public/tháng HOẶC được duyệt làm Contributor",
        },
        {
          heading: "Ranking Points (RP)",
          content: `RP ghi nhận tiến độ đã xác minh qua bốn giai đoạn: VALIDATE, BUILD, SHIP và CONTRIBUTE. Bảng RP đầy đủ, kèm giới hạn của từng hoạt động, nằm trong quy chế Phân loại & Hạng thành viên.\n\n${rulesetNotice("vi")}`,
        },
      ],
    },
  },
};
