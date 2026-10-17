import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { EventTypeKey } from "@/lib/builder-league/types";

/** The builder passport section on `/builders/[id]`. */
export interface PassportCopy {
  eyebrow: string;
  title: string;
  lede: string;
  privateNote: string;
  level: string;
  rank: string;
  rp: (rp: number) => string;
  stageMix: string;
  milestones: string;
  noMilestones: string;
  badges: string;
  projects: string;
  proofLinks: string;
  redacted: string;
  eventTypes: Record<EventTypeKey, string>;
  ogSubtitle: (rank: string, level: number) => string;
}

const en: PassportCopy = {
  eyebrow: "Builder League · passport",
  title: "Builder passport",
  lede: "Verified milestones only. Every item was checked by a moderator or the system.",
  privateNote: "You are seeing the full private view. Visitors only see what you made public.",
  level: "Level",
  rank: "Rank",
  rp: (rp) => `${rp} RP`,
  stageMix: "Stage mix",
  milestones: "Milestones",
  noMilestones: "No public milestones yet.",
  badges: "Badges",
  projects: "Projects",
  proofLinks: "Proof",
  redacted: "Details hidden by the builder",
  eventTypes: {
    validate_problem_signal: "Problem signal",
    validate_interviews: "Customer interviews",
    validate_waitlist: "Waitlist",
    validate_wtp_commitment: "Commitment to pay",
    validate_stop_pivot: "Stop or pivot decision",
    build_scope_cut: "Scope cut",
    build_mvp: "MVP shipped to testers",
    build_first_real_user: "First real user",
    build_feedback_improvement: "Improvement from feedback",
    ship_public_post: "Public build post",
    ship_highlighted_post: "Highlighted post",
    ship_product_launch: "Product launch",
    ship_first_payment: "First payment",
    ship_distribution_case_study: "Distribution case study",
    contribute_peer_help: "Peer help",
    contribute_weekly_feedback: "Weekly feedback",
    contribute_contributor_work: "Contributor work",
    contribute_discord_active: "Active in the community",
    contribute_featured: "Featured contribution",
  },
  ogSubtitle: (rank, level) => `${rank} · Level ${level} in the Builder League.`,
};

const vi: PassportCopy = {
  eyebrow: "Builder League · hộ chiếu",
  title: "Hộ chiếu builder",
  lede: "Chỉ gồm cột mốc đã xác minh. Mỗi mục đều được moderator hoặc hệ thống kiểm tra.",
  privateNote: "Bạn đang xem bản riêng tư đầy đủ. Khách chỉ thấy những gì bạn đã công khai.",
  level: "Cấp độ",
  rank: "Hạng",
  rp: (rp) => `${rp} RP`,
  stageMix: "Tỷ trọng giai đoạn",
  milestones: "Cột mốc",
  noMilestones: "Chưa có cột mốc công khai.",
  badges: "Huy hiệu",
  projects: "Dự án",
  proofLinks: "Bằng chứng",
  redacted: "Builder đã ẩn chi tiết",
  eventTypes: {
    validate_problem_signal: "Tín hiệu vấn đề",
    validate_interviews: "Phỏng vấn khách hàng",
    validate_waitlist: "Danh sách chờ",
    validate_wtp_commitment: "Cam kết trả tiền",
    validate_stop_pivot: "Quyết định dừng hoặc đổi hướng",
    build_scope_cut: "Cắt phạm vi",
    build_mvp: "MVP gửi người thử",
    build_first_real_user: "Người dùng thật đầu tiên",
    build_feedback_improvement: "Cải tiến từ góp ý",
    ship_public_post: "Bài đăng quá trình build",
    ship_highlighted_post: "Bài được nổi bật",
    ship_product_launch: "Ra mắt sản phẩm",
    ship_first_payment: "Khoản thanh toán đầu tiên",
    ship_distribution_case_study: "Case study phân phối",
    contribute_peer_help: "Giúp đỡ đồng đội",
    contribute_weekly_feedback: "Góp ý hằng tuần",
    contribute_contributor_work: "Công việc contributor",
    contribute_discord_active: "Hoạt động trong cộng đồng",
    contribute_featured: "Đóng góp được nổi bật",
  },
  ogSubtitle: (rank, level) => `${rank} · Cấp ${level} trong Builder League.`,
};

export const passportCopy: Record<PageLocale, PassportCopy> = { en, vi };

export function getPassportCopy(locale: string): PassportCopy {
  return passportCopy[toPageLocale(locale)];
}
