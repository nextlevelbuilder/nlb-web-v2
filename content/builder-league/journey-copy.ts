import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { EventTypeKey, RankKey, Stage } from "@/lib/builder-league/types";
import type { JourneyItemState, JourneyRelationType } from "@/lib/builder-league/journey";

/** Builder League journey copy: the member's own timeline and its constellation view. */
export interface JourneyCopy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lede: string;
  timelineHeading: string;
  constellationHeading: string;
  constellationHint: string;
  constellationLabel: (count: number) => string;
  empty: { title: string; body: string };
  projectFilterLabel: string;
  allProjects: string;
  noProject: string;
  stages: Record<Stage, string>;
  eventTypes: Record<EventTypeKey, string>;
  ranks: Record<RankKey, string>;
  states: Record<JourneyItemState, string>;
  relations: Record<JourneyRelationType, string>;
  kinds: { correction: string; reversal: string; adjustment: string; badge: string; rank: string; evidence: string };
  learning: string;
  backfill: (label: string | null, importedOn: string) => string;
  rp: (rp: number) => string;
  untrackedBefore: (month: string) => string;
  monthCount: (count: number) => string;
  loadMore: string;
  yearLink: (year: number) => string;
}

const en: JourneyCopy = {
  metaTitle: "My builder journey",
  metaDescription: "Every verified step of your builder journey, in order: ideas, evidence, launches, and what you learned on the way.",
  eyebrow: "I · Your sky so far",
  title: "Every step you have charted",
  lede: "Your verified work, oldest first. Corrections and reversals stay visible, and imported history says where it came from.",
  timelineHeading: "Timeline",
  constellationHeading: "Constellation",
  constellationHint: "Use the arrow keys to move between stars; Enter jumps to the step in the timeline.",
  constellationLabel: (count) => `Constellation of ${count} verified steps`,
  empty: { title: "No steps charted yet", body: "Submit your first evidence and it appears here once it is reviewed." },
  projectFilterLabel: "Project",
  allProjects: "All projects",
  noProject: "No project",
  stages: { validate: "Validate", build: "Build", ship: "Ship", contribute: "Contribute" },
  eventTypes: {
    validate_problem_signal: "Problem signal",
    validate_interviews: "Customer interviews",
    validate_waitlist: "Waitlist",
    validate_wtp_commitment: "Willingness to pay",
    validate_stop_pivot: "Stop or pivot decision",
    build_scope_cut: "Scope cut",
    build_mvp: "Working MVP",
    build_first_real_user: "First real user",
    build_feedback_improvement: "Shipped from feedback",
    ship_public_post: "Build in public",
    ship_highlighted_post: "Highlighted post",
    ship_product_launch: "Product launch",
    ship_first_payment: "First payment",
    ship_distribution_case_study: "Distribution case study",
    contribute_peer_help: "Helped a peer",
    contribute_weekly_feedback: "Weekly feedback",
    contribute_contributor_work: "Contributor work",
    contribute_discord_active: "Active in Discord",
    contribute_featured: "Featured by the community",
  },
  ranks: { apprentice: "Apprentice", builder: "Builder", architect: "Architect", master: "Master", legend: "Legend" },
  states: {
    verified: "Verified",
    self_reported: "Self-reported",
    pending: "In review",
    needs_info: "Needs more info",
    rejected: "Not accepted",
    withdrawn: "Withdrawn",
    corrected: "Corrected",
    reversed: "Reversed",
    revoked: "Revoked",
  },
  relations: {
    corrects: "Corrects an earlier step",
    reverses: "Reverses an earlier step",
    corrected_by: "Corrected later",
    reversed_by: "Reversed later",
    led_to: "Led to the next idea",
    followed_pivot: "Came after a pivot",
  },
  kinds: { correction: "Correction", reversal: "Reversal", adjustment: "Adjustment", badge: "Badge earned", rank: "Rank reached", evidence: "Evidence" },
  learning: "Learning",
  backfill: (label, importedOn) => `Imported history${label ? ` (${label})` : ""}, added ${importedOn}`,
  rp: (rp) => `${rp > 0 ? "+" : ""}${rp} RP`,
  untrackedBefore: (month) => `Not tracked before ${month}.`,
  monthCount: (count) => `${count} ${count === 1 ? "step" : "steps"}`,
  loadMore: "Show more",
  yearLink: (year) => `Open your ${year} in review`,
};

const vi: JourneyCopy = {
  metaTitle: "Hành trình builder của tôi",
  metaDescription: "Mọi bước đã được xác minh trên hành trình builder của bạn, theo thứ tự: ý tưởng, bằng chứng, ra mắt và những điều học được.",
  eyebrow: "I · Bầu trời của bạn",
  title: "Từng bước bạn đã vẽ nên",
  lede: "Những việc đã được xác minh, cũ nhất trước. Các lần đính chính và thu hồi vẫn hiện rõ, dữ liệu nhập lại luôn ghi nguồn gốc.",
  timelineHeading: "Dòng thời gian",
  constellationHeading: "Chòm sao",
  constellationHint: "Dùng phím mũi tên để đi giữa các ngôi sao; Enter để tới bước đó trên dòng thời gian.",
  constellationLabel: (count) => `Chòm sao gồm ${count} bước đã xác minh`,
  empty: { title: "Chưa có bước nào", body: "Gửi bằng chứng đầu tiên, sau khi được duyệt nó sẽ xuất hiện ở đây." },
  projectFilterLabel: "Dự án",
  allProjects: "Tất cả dự án",
  noProject: "Không thuộc dự án",
  stages: { validate: "Kiểm chứng", build: "Xây dựng", ship: "Ra mắt", contribute: "Đóng góp" },
  eventTypes: {
    validate_problem_signal: "Tín hiệu vấn đề",
    validate_interviews: "Phỏng vấn khách hàng",
    validate_waitlist: "Danh sách chờ",
    validate_wtp_commitment: "Cam kết trả tiền",
    validate_stop_pivot: "Quyết định dừng hoặc chuyển hướng",
    build_scope_cut: "Cắt phạm vi",
    build_mvp: "MVP chạy được",
    build_first_real_user: "Người dùng thật đầu tiên",
    build_feedback_improvement: "Cải tiến từ phản hồi",
    ship_public_post: "Build in public",
    ship_highlighted_post: "Bài viết nổi bật",
    ship_product_launch: "Ra mắt sản phẩm",
    ship_first_payment: "Khoản thanh toán đầu tiên",
    ship_distribution_case_study: "Case study phân phối",
    contribute_peer_help: "Giúp một builder khác",
    contribute_weekly_feedback: "Góp ý hằng tuần",
    contribute_contributor_work: "Đóng góp cho cộng đồng",
    contribute_discord_active: "Hoạt động trên Discord",
    contribute_featured: "Được cộng đồng vinh danh",
  },
  ranks: { apprentice: "Học việc", builder: "Builder", architect: "Kiến trúc sư", master: "Bậc thầy", legend: "Huyền thoại" },
  states: {
    verified: "Đã xác minh",
    self_reported: "Tự khai",
    pending: "Đang duyệt",
    needs_info: "Cần bổ sung",
    rejected: "Không được chấp nhận",
    withdrawn: "Đã rút",
    corrected: "Đã đính chính",
    reversed: "Đã thu hồi",
    revoked: "Đã thu hồi",
  },
  relations: {
    corrects: "Đính chính một bước trước",
    reverses: "Thu hồi một bước trước",
    corrected_by: "Được đính chính sau đó",
    reversed_by: "Bị thu hồi sau đó",
    led_to: "Dẫn tới ý tưởng tiếp theo",
    followed_pivot: "Đến sau một lần chuyển hướng",
  },
  kinds: { correction: "Đính chính", reversal: "Thu hồi", adjustment: "Điều chỉnh", badge: "Nhận huy hiệu", rank: "Lên hạng", evidence: "Bằng chứng" },
  learning: "Bài học",
  backfill: (label, importedOn) => `Dữ liệu nhập lại${label ? ` (${label})` : ""}, thêm vào ngày ${importedOn}`,
  rp: (rp) => `${rp > 0 ? "+" : ""}${rp} RP`,
  untrackedBefore: (month) => `Chưa ghi nhận trước ${month}.`,
  monthCount: (count) => `${count} bước`,
  loadMore: "Xem thêm",
  yearLink: (year) => `Mở năm ${year} của bạn`,
};

export const journeyCopy: Record<PageLocale, JourneyCopy> = { en, vi };

export function getJourneyCopy(locale: string): JourneyCopy {
  return journeyCopy[toPageLocale(locale)];
}

/** Label of an event type, falling back to the raw key for types a later ruleset adds. */
export function eventTypeLabel(copy: JourneyCopy, eventType: string): string {
  return (copy.eventTypes as Record<string, string>)[eventType] ?? eventType;
}
