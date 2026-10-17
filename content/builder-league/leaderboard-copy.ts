import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { BoardKey, PeriodType, RankKey, Stage } from "@/lib/builder-league/types";

/** Builder League boards: the `/builder-league/leaderboards` page and the builder tab on `/leaderboards`. */
export interface LeaderboardCopy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lede: string;
  boardNav: string;
  periodNav: string;
  boards: Record<BoardKey, { label: string; description: string }>;
  periods: Record<PeriodType, string>;
  stages: Record<Stage, string>;
  ranks: Record<RankKey, string>;
  previous: string;
  next: string;
  latest: string;
  status: { provisional: string; final: string };
  revision: (n: number) => string;
  ruleset: string;
  auditHash: string;
  updated: string;
  columns: { rank: string; builder: string; score: string };
  rankLabel: (n: number) => string;
  events: (n: number) => string;
  previousScore: (score: string) => string;
  emptyTitle: string;
  emptyDesc: string;
  you: {
    title: string;
    position: (position: number, outOf: number) => string;
    notRanked: string;
    hidden: string;
    listed: string;
    settings: string;
  };
  tab: { eyebrow: string; title: string; desc: string; cta: string; leader: (name: string, score: string) => string };
  ogTitle: string;
  ogSubtitle: string;
}

const en: LeaderboardCopy = {
  metaTitle: "Builder League boards",
  metaDescription: "Weekly, monthly and season boards of verified builder work across validate, build, ship and contribute.",
  eyebrow: "Builder League · boards",
  title: "Verified work, ranked by stage.",
  lede: "Scores come only from moderator-verified activity, capped per stage. Membership tier never counts.",
  boardNav: "Board",
  periodNav: "Period",
  boards: {
    overall: { label: "Overall", description: "Weighted across the four stages." },
    validate: { label: "Validate", description: "Problem signals, interviews, waitlists and commitments." },
    build: { label: "Build", description: "Scope cuts, MVPs, first real users and improvements." },
    ship: { label: "Ship", description: "Public posts, launches, first payments and case studies." },
    contribute: { label: "Contribute", description: "Peer help, weekly feedback and contributor work." },
    rising: { label: "Rising", description: "Biggest gain over the builder's own previous period, with at least two verified events." },
    newcomers: { label: "Newcomers", description: "Builders whose first verified work is under 90 days old." },
  },
  periods: { week: "Week", month: "Month", season: "Season", year: "Year" },
  stages: { validate: "Validate", build: "Build", ship: "Ship", contribute: "Contribute" },
  ranks: { apprentice: "Apprentice", builder: "Builder", architect: "Architect", master: "Master", legend: "Legend" },
  previous: "Previous",
  next: "Next",
  latest: "Current",
  status: { provisional: "Provisional", final: "Final" },
  revision: (n) => `Revision ${n}`,
  ruleset: "Ruleset",
  auditHash: "Audit hash",
  updated: "Computed",
  columns: { rank: "Rank", builder: "Builder", score: "Score" },
  rankLabel: (n) => `Rank ${n}`,
  events: (n) => (n === 1 ? "1 verified event" : `${n} verified events`),
  previousScore: (score) => `from ${score}`,
  emptyTitle: "No public entries yet",
  emptyDesc: "Builders appear here once they have verified work in this period and choose to be listed.",
  you: {
    title: "Your position",
    position: (position, outOf) => `#${position} of ${outOf}`,
    notRanked: "No verified work in this period yet.",
    hidden: "Only you can see this. Others do not see you on the board.",
    listed: "You are listed publicly on this board.",
    settings: "Privacy settings",
  },
  tab: {
    eyebrow: "Builder League",
    title: "Builder boards",
    desc: "This week's verified work by stage, from validate to contribute.",
    cta: "Open builder boards",
    leader: (name, score) => `Leading this week: ${name} · ${score}`,
  },
  ogTitle: "Builder League boards",
  ogSubtitle: "Verified builder work, ranked by stage each week, month and season.",
};

const vi: LeaderboardCopy = {
  metaTitle: "Bảng xếp hạng Builder League",
  metaDescription: "Bảng tuần, tháng và mùa của công việc builder đã xác minh qua kiểm chứng, xây dựng, phát hành và đóng góp.",
  eyebrow: "Builder League · bảng xếp hạng",
  title: "Công việc đã xác minh, xếp theo từng giai đoạn.",
  lede: "Điểm chỉ đến từ hoạt động được moderator xác minh, có giới hạn theo từng giai đoạn. Gói thành viên không bao giờ được tính.",
  boardNav: "Bảng",
  periodNav: "Kỳ",
  boards: {
    overall: { label: "Tổng", description: "Có trọng số trên cả bốn giai đoạn." },
    validate: { label: "Kiểm chứng", description: "Tín hiệu vấn đề, phỏng vấn, waitlist và cam kết trả tiền." },
    build: { label: "Xây dựng", description: "Cắt phạm vi, MVP, người dùng thật đầu tiên và cải tiến." },
    ship: { label: "Phát hành", description: "Bài đăng công khai, ra mắt, khoản thanh toán đầu tiên và case study." },
    contribute: { label: "Đóng góp", description: "Giúp đỡ đồng đội, góp ý hằng tuần và công việc contributor." },
    rising: { label: "Bứt phá", description: "Tăng nhiều nhất so với kỳ trước của chính builder, tối thiểu hai hoạt động đã xác minh." },
    newcomers: { label: "Người mới", description: "Builder có công việc xác minh đầu tiên chưa quá 90 ngày." },
  },
  periods: { week: "Tuần", month: "Tháng", season: "Mùa", year: "Năm" },
  stages: { validate: "Kiểm chứng", build: "Xây dựng", ship: "Phát hành", contribute: "Đóng góp" },
  ranks: { apprentice: "Học việc", builder: "Builder", architect: "Kiến trúc sư", master: "Bậc thầy", legend: "Huyền thoại" },
  previous: "Kỳ trước",
  next: "Kỳ sau",
  latest: "Hiện tại",
  status: { provisional: "Tạm tính", final: "Chốt" },
  revision: (n) => `Bản sửa ${n}`,
  ruleset: "Bộ luật",
  auditHash: "Mã kiểm toán",
  updated: "Tính lúc",
  columns: { rank: "Hạng", builder: "Builder", score: "Điểm" },
  rankLabel: (n) => `Hạng ${n}`,
  events: (n) => `${n} hoạt động đã xác minh`,
  previousScore: (score) => `từ ${score}`,
  emptyTitle: "Chưa có ai công khai",
  emptyDesc: "Builder xuất hiện ở đây khi có công việc đã xác minh trong kỳ và chọn hiển thị công khai.",
  you: {
    title: "Vị trí của bạn",
    position: (position, outOf) => `#${position} trên ${outOf}`,
    notRanked: "Bạn chưa có công việc đã xác minh trong kỳ này.",
    hidden: "Chỉ bạn thấy dòng này. Người khác không thấy bạn trên bảng.",
    listed: "Bạn đang hiển thị công khai trên bảng này.",
    settings: "Cài đặt quyền riêng tư",
  },
  tab: {
    eyebrow: "Builder League",
    title: "Bảng builder",
    desc: "Công việc đã xác minh của tuần này theo từng giai đoạn, từ kiểm chứng đến đóng góp.",
    cta: "Mở bảng builder",
    leader: (name, score) => `Dẫn đầu tuần này: ${name} · ${score}`,
  },
  ogTitle: "Bảng xếp hạng Builder League",
  ogSubtitle: "Công việc builder đã xác minh, xếp theo giai đoạn mỗi tuần, tháng và mùa.",
};

export const leaderboardCopy: Record<PageLocale, LeaderboardCopy> = { en, vi };

export function getLeaderboardCopy(locale: string): LeaderboardCopy {
  return leaderboardCopy[toPageLocale(locale)];
}
