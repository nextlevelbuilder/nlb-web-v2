import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { BoardKey } from "@/lib/builder-league/types";

/** Public annual Hall of Fame (`/wrapped/{year}/hall-of-fame`). */
export interface HallOfFameCopy {
  metaTitle: (year: number) => string;
  metaDescription: (year: number) => string;
  ogAlt: string;
  ogKicker: (year: number) => string;
  eyebrow: (year: number) => string;
  title: (year: number) => string;
  lede: string;
  status: { final: string; notFinal: string };
  finalMeta: (date: string) => string;
  notFinal: {
    title: (year: number) => string;
    open: (date: string) => string;
    pending: (date: string) => string;
  };
  boards: Record<BoardKey, { label: string; description: string }>;
  empty: string;
  rankLabel: (rank: number) => string;
  score: (score: string) => string;
  events: (n: number) => string;
  previousScore: (score: string) => string;
  revisionMeta: (revision: number, ruleset: string) => string;
  auditHash: string;
  methodHeading: string;
  method: string;
  wrappedLink: (year: number) => string;
  cta: string;
}

const en: HallOfFameCopy = {
  metaTitle: (year) => `NLB Builder League Hall of Fame ${year}`,
  metaDescription: (year) => `The official, final ${year} results of the Next Level Builders Builder League, from verified work only.`,
  ogAlt: "NLB Builder League Hall of Fame",
  ogKicker: (year) => `Hall of Fame ${year}`,
  eyebrow: (year) => `Plate ${year} · The brightest stars`,
  title: (year) => `The builders who shone brightest in ${year}`,
  lede: "Official year-end results, frozen once every review closed. Only builders who chose to appear on public boards are named.",
  status: { final: "Final", notFinal: "Not final yet" },
  finalMeta: (date) => `Frozen ${date}`,
  notFinal: {
    title: (year) => `The ${year} results are not final yet`,
    open: (date) => `The year is still being charted. Official results are published after December 31 and the review grace period, no earlier than ${date}.`,
    pending: (date) => `The year has ended and its last reviews are closing. Official results appear here once every board is frozen, no earlier than ${date}.`,
  },
  boards: {
    overall: { label: "Overall", description: "Top ten across all four stages, weighted." },
    validate: { label: "Validate", description: "Problem signals, interviews, waitlists and commitments." },
    build: { label: "Build", description: "Scope cuts, MVPs, first real users and improvements." },
    ship: { label: "Ship", description: "Public posts, launches, first payments and case studies." },
    contribute: { label: "Contribute", description: "Peer help, weekly feedback and contributor work." },
    rising: { label: "Rising", description: "Biggest gain over the builder's own previous year." },
    newcomers: { label: "Newcomers", description: "Builders whose first verified work was under 90 days old." },
  },
  empty: "No builder on this board chose to be listed publicly.",
  rankLabel: (rank) => `Rank ${rank}`,
  score: (score) => `${score} pts`,
  events: (n) => `${n} verified ${n === 1 ? "event" : "events"}`,
  previousScore: (score) => `from ${score}`,
  revisionMeta: (revision, ruleset) => `Revision ${revision} · ruleset ${ruleset}`,
  auditHash: "Audit hash",
  methodHeading: "How this was decided",
  method: "Ranks come from the final yearly league snapshots: moderator-verified work only, capped per stage, with membership tier never counted. Late corrections publish a new revision. Builders who keep their boards private are left out and the ranks are renumbered, so no one can be inferred.",
  wrappedLink: (year) => `See the community's ${year}`,
  cta: "Join the builders",
};

const vi: HallOfFameCopy = {
  metaTitle: (year) => `Đại sảnh Danh vọng Builder League NLB ${year}`,
  metaDescription: (year) => `Kết quả chính thức năm ${year} của Builder League Next Level Builders, chỉ tính từ công việc đã xác minh.`,
  ogAlt: "Đại sảnh Danh vọng Builder League NLB",
  ogKicker: (year) => `Đại sảnh ${year}`,
  eyebrow: (year) => `Bản đồ ${year} · Những ngôi sao sáng nhất`,
  title: (year) => `Những builder tỏa sáng nhất năm ${year}`,
  lede: "Kết quả cuối năm chính thức, được chốt khi mọi lượt duyệt đã đóng. Chỉ những builder chọn hiện trên bảng công khai mới được nêu tên.",
  status: { final: "Chính thức", notFinal: "Chưa chốt" },
  finalMeta: (date) => `Chốt ngày ${date}`,
  notFinal: {
    title: (year) => `Kết quả năm ${year} chưa được chốt`,
    open: (date) => `Năm nay vẫn đang được ghi lại. Kết quả chính thức công bố sau ngày 31 tháng 12 và thời gian chờ duyệt, sớm nhất là ${date}.`,
    pending: (date) => `Năm đã kết thúc và những lượt duyệt cuối đang khép lại. Kết quả chính thức sẽ xuất hiện khi mọi bảng được chốt, sớm nhất là ${date}.`,
  },
  boards: {
    overall: { label: "Tổng", description: "Mười người dẫn đầu, có trọng số trên cả bốn giai đoạn." },
    validate: { label: "Kiểm chứng", description: "Tín hiệu vấn đề, phỏng vấn, danh sách chờ và cam kết." },
    build: { label: "Xây dựng", description: "Cắt phạm vi, MVP, người dùng thật đầu tiên và cải tiến." },
    ship: { label: "Phát hành", description: "Bài đăng công khai, ra mắt, khoản thanh toán đầu tiên và case study." },
    contribute: { label: "Đóng góp", description: "Giúp đỡ nhau, góp ý hằng tuần và công việc đóng góp." },
    rising: { label: "Bứt phá", description: "Mức tăng lớn nhất so với chính builder đó năm trước." },
    newcomers: { label: "Người mới", description: "Builder có công việc xác minh đầu tiên chưa quá 90 ngày." },
  },
  empty: "Chưa builder nào trên bảng này chọn hiện công khai.",
  rankLabel: (rank) => `Hạng ${rank}`,
  score: (score) => `${score} điểm`,
  events: (n) => `${n} hoạt động đã xác minh`,
  previousScore: (score) => `từ ${score}`,
  revisionMeta: (revision, ruleset) => `Bản ${revision} · bộ luật ${ruleset}`,
  auditHash: "Mã kiểm toán",
  methodHeading: "Cách xếp hạng",
  method: "Thứ hạng lấy từ ảnh chụp bảng xếp hạng năm đã chốt: chỉ công việc được kiểm duyệt viên xác minh, có giới hạn theo giai đoạn, và hạng thành viên không bao giờ được tính. Hiệu chỉnh muộn sẽ ra một bản mới. Builder để bảng ở chế độ riêng tư không được liệt kê và thứ hạng được đánh số lại, nên không ai bị suy ra.",
  wrappedLink: (year) => `Xem năm ${year} của cộng đồng`,
  cta: "Tham gia cùng các builder",
};

export const hallOfFameCopy: Record<PageLocale, HallOfFameCopy> = { en, vi };

export function getHallOfFameCopy(locale: string): HallOfFameCopy {
  return hallOfFameCopy[toPageLocale(locale)];
}
