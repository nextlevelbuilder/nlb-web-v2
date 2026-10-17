import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { ArchetypeKey, SceneKey } from "@/lib/builder-league/year-review";

/** "Your Year Among the Stars": the member's Year in Review, its sharing and its video. */
export interface YearReviewCopy {
  metaTitle: (year: number) => string;
  metaDescription: string;
  eyebrow: (year: number) => string;
  title: (year: number) => string;
  lede: string;
  status: { provisional: string; final: string; provisionalNote: string; finalNote: string };
  versionMeta: (version: number, ruleset: string) => string;
  rulesetMeta: (ruleset: string) => string;
  scenes: Record<SceneKey, { title: string; caption: string }>;
  stats: { milestones: string; projects: string; activeWeeks: string; rp: string; peopleHelped: string; learnings: string };
  archetypes: Record<ArchetypeKey, { name: string; line: string }>;
  archetypeNote: string;
  standoutDay: (date: string, count: number) => string;
  peers: string;
  nextYear: { heading: string; empty: string };
  missing: { heading: string; body: string; untracked: (date: string) => string; backfill: (count: number, labels: string) => string };
  empty: { title: string; body: string };
  journeyLink: string;
  sharing: {
    heading: string;
    intro: string;
    visibilityHint: string;
    hideLabel: string;
    hideHint: string;
    save: string;
    saved: string;
    preview: string;
    previewEmpty: string;
    createLink: string;
    creating: string;
    newLink: string;
    copy: string;
    copied: string;
    linksHeading: string;
    noLinks: string;
    created: (date: string) => string;
    revoked: (date: string) => string;
    revoke: string;
    revokeConfirm: string;
    funnel: (visits: number, signups: number, paid: number) => string;
    error: string;
  };
  video: {
    heading: string;
    intro: string;
    formats: { "9x16": string; "16x9": string };
    request: (format: string) => string;
    statuses: { queued: string; claimed: string; done: string; failed: string; expired: string };
    download: string;
    poster: string;
    expires: (date: string) => string;
    none: string;
    nothingToRender: string;
  };
}

const en: YearReviewCopy = {
  metaTitle: (year) => `My ${year} among the stars`,
  metaDescription: "Your verified builder year, chapter by chapter: what you validated, built, shipped and gave back.",
  eyebrow: (year) => `Plate ${year} · Your year among the stars`,
  title: (year) => `Your ${year}, charted`,
  lede: "Only verified milestones appear. A chapter without a real milestone is left out rather than filled in.",
  status: {
    provisional: "Provisional",
    final: "Final",
    provisionalNote: "Counts activity verified so far. It becomes final after December 31 and the review grace period.",
    finalNote: "Frozen after the year closed and every review was done. It will not change.",
  },
  versionMeta: (version, ruleset) => `Version ${version} · ruleset ${ruleset}`,
  rulesetMeta: (ruleset) => `Ruleset ${ruleset}`,
  scenes: {
    year_in_numbers: { title: "The year in numbers", caption: "Verified milestones across the four stages." },
    first_idea: { title: "The first point of light", caption: "Where the year began: the first problem worth chasing." },
    validation: { title: "Proof before code", caption: "Evidence that someone wants it: interviews, waitlists, commitments." },
    pivotal_learning: { title: "The turn", caption: "A decision to stop or change course, backed by evidence. A learning, not a failure." },
    mvp: { title: "It works", caption: "The first version real people could use." },
    launch: { title: "Into the open sky", caption: "The public launch." },
    first_customer: { title: "Someone paid", caption: "The first verified payment." },
    community_impact: { title: "Light for others", caption: "Help given to other builders." },
    league_highlights: { title: "On the charts", caption: "Ranks, badges and league standings earned this year." },
    next_year: { title: "Next year's star", caption: "What you set out to do next." },
  },
  stats: { milestones: "Verified milestones", projects: "Projects", activeWeeks: "Active weeks", rp: "Reputation points", peopleHelped: "Builders helped", learnings: "Learnings" },
  archetypes: {
    pathfinder: { name: "The Pathfinder", line: "Most of your year went into finding the right problem." },
    maker: { name: "The Maker", line: "Most of your year went into building." },
    launcher: { name: "The Launcher", line: "Most of your year went into shipping in public." },
    guide: { name: "The Guide", line: "Most of your year went into helping other builders." },
    polymath: { name: "The Polymath", line: "Your year spread evenly across every stage." },
  },
  archetypeNote: "A summary of your activity mix, not a label of who you are.",
  standoutDay: (date, count) => `Brightest day: ${date}, with ${count} verified milestones.`,
  peers: "Builders you worked with",
  nextYear: { heading: "Your note for next year", empty: "No note yet. Add one in your time capsule." },
  missing: {
    heading: "What this review cannot show",
    body: "These chapters have no verified milestone this year, so they are left out:",
    untracked: (date) => `Tracking starts on ${date}; nothing earlier is shown or estimated.`,
    backfill: (count, labels) => `${count} imported ${count === 1 ? "milestone" : "milestones"} (${labels}), labelled as such.`,
  },
  empty: { title: "No verified milestones this year yet", body: "Your year fills in as moderators verify your evidence." },
  journeyLink: "See the full journey",
  sharing: {
    heading: "Share your year",
    intro: "A share link shows a smaller version: public milestones only, without points, scores or private notes.",
    visibilityHint: "Only milestones you made public can appear. Change visibility on each piece of evidence.",
    hideLabel: "Chapters to keep out of the shared version and the video",
    hideHint: "Hidden chapters stay in your private review.",
    save: "Save chapters",
    saved: "Saved",
    preview: "What others will see",
    previewEmpty: "Nothing to share yet: make at least one milestone public.",
    createLink: "Create share link",
    creating: "Creating…",
    newLink: "Your new link. Copy it now: it is shown only once.",
    copy: "Copy link",
    copied: "Copied",
    linksHeading: "Your links",
    noLinks: "No links yet.",
    created: (date) => `Created ${date}`,
    revoked: (date) => `Revoked ${date}`,
    revoke: "Revoke",
    revokeConfirm: "Revoke this link? Anyone holding it loses access right away.",
    funnel: (visits, signups, paid) => `${visits} visits · ${signups} sign-ups · ${paid} members`,
    error: "Something went wrong. Try again.",
  },
  video: {
    heading: "Your year as a video",
    intro: "A 30 to 60 second video of the shared chapters, with captions. Files are private and kept for 30 days.",
    formats: { "9x16": "Vertical 9:16", "16x9": "Wide 16:9" },
    request: (format) => `Render ${format}`,
    statuses: { queued: "Queued", claimed: "Rendering", done: "Ready", failed: "Failed", expired: "Expired" },
    download: "Download video",
    poster: "Download still",
    expires: (date) => `Available until ${date}`,
    none: "No video yet.",
    nothingToRender: "Make at least one milestone public and keep its chapter visible to render a video.",
  },
};

const vi: YearReviewCopy = {
  metaTitle: (year) => `Năm ${year} giữa các vì sao của tôi`,
  metaDescription: "Một năm builder đã được xác minh, từng chương một: những gì bạn đã kiểm chứng, xây dựng, ra mắt và đóng góp.",
  eyebrow: (year) => `Bản đồ ${year} · Năm của bạn giữa các vì sao`,
  title: (year) => `Năm ${year} của bạn, trên bản đồ sao`,
  lede: "Chỉ những cột mốc đã được xác minh mới xuất hiện. Chương nào chưa có cột mốc thật sẽ được bỏ qua, không lấp chỗ trống.",
  status: {
    provisional: "Tạm tính",
    final: "Chính thức",
    provisionalNote: "Tính các hoạt động đã được xác minh đến nay. Sẽ chốt chính thức sau ngày 31/12 và thời gian duyệt bổ sung.",
    finalNote: "Đã chốt sau khi năm khép lại và mọi bằng chứng đã được duyệt. Sẽ không thay đổi nữa.",
  },
  versionMeta: (version, ruleset) => `Phiên bản ${version} · bộ luật ${ruleset}`,
  rulesetMeta: (ruleset) => `Bộ luật ${ruleset}`,
  scenes: {
    year_in_numbers: { title: "Một năm qua những con số", caption: "Các cột mốc đã xác minh qua bốn chặng." },
    first_idea: { title: "Đốm sáng đầu tiên", caption: "Nơi năm bắt đầu: vấn đề đầu tiên đáng theo đuổi." },
    validation: { title: "Chứng minh trước khi viết code", caption: "Bằng chứng có người cần: phỏng vấn, danh sách chờ, cam kết trả tiền." },
    pivotal_learning: { title: "Bước ngoặt", caption: "Quyết định dừng hoặc đổi hướng dựa trên bằng chứng. Đó là bài học, không phải thất bại." },
    mvp: { title: "Nó chạy rồi", caption: "Phiên bản đầu tiên người thật dùng được." },
    launch: { title: "Bay ra bầu trời rộng", caption: "Lần ra mắt công khai." },
    first_customer: { title: "Có người trả tiền", caption: "Khoản thanh toán đầu tiên đã được xác minh." },
    community_impact: { title: "Thắp sáng cho người khác", caption: "Những lần bạn giúp các builder khác." },
    league_highlights: { title: "Trên bảng xếp hạng", caption: "Hạng, huy hiệu và thứ hạng giải đấu trong năm." },
    next_year: { title: "Ngôi sao của năm sau", caption: "Điều bạn đặt ra cho chặng tiếp theo." },
  },
  stats: { milestones: "Cột mốc đã xác minh", projects: "Dự án", activeWeeks: "Tuần hoạt động", rp: "Điểm uy tín", peopleHelped: "Builder được giúp", learnings: "Bài học" },
  archetypes: {
    pathfinder: { name: "Người tìm đường", line: "Phần lớn năm của bạn dành cho việc tìm đúng vấn đề." },
    maker: { name: "Người chế tác", line: "Phần lớn năm của bạn dành cho việc xây dựng." },
    launcher: { name: "Người phóng tàu", line: "Phần lớn năm của bạn dành cho việc ra mắt công khai." },
    guide: { name: "Người dẫn lối", line: "Phần lớn năm của bạn dành cho việc giúp các builder khác." },
    polymath: { name: "Người đa năng", line: "Năm của bạn trải đều qua mọi chặng." },
  },
  archetypeNote: "Đây là tóm tắt cách bạn phân bổ hoạt động, không phải nhãn dán về con người bạn.",
  standoutDay: (date, count) => `Ngày rực rỡ nhất: ${date}, với ${count} cột mốc đã xác minh.`,
  peers: "Những builder đã đồng hành",
  nextYear: { heading: "Lời nhắn cho năm sau", empty: "Chưa có lời nhắn. Hãy thêm trong hộp thời gian của bạn." },
  missing: {
    heading: "Những gì bản tổng kết này chưa thể hiện",
    body: "Các chương sau chưa có cột mốc đã xác minh trong năm nên được bỏ qua:",
    untracked: (date) => `Dữ liệu bắt đầu từ ${date}; trước đó không hiển thị và không ước đoán.`,
    backfill: (count, labels) => `${count} cột mốc được nhập lại (${labels}), có ghi chú rõ ràng.`,
  },
  empty: { title: "Năm nay chưa có cột mốc nào được xác minh", body: "Năm của bạn sẽ dần đầy lên khi điều phối viên duyệt bằng chứng." },
  journeyLink: "Xem toàn bộ hành trình",
  sharing: {
    heading: "Chia sẻ năm của bạn",
    intro: "Liên kết chia sẻ chỉ hiện phiên bản rút gọn: các cột mốc công khai, không có điểm, không có tổng điểm, không có ghi chú riêng.",
    visibilityHint: "Chỉ những cột mốc bạn để công khai mới có thể xuất hiện. Đổi chế độ hiển thị ở từng bằng chứng.",
    hideLabel: "Các chương không đưa vào bản chia sẻ và video",
    hideHint: "Chương bị ẩn vẫn nằm trong bản tổng kết riêng của bạn.",
    save: "Lưu lựa chọn",
    saved: "Đã lưu",
    preview: "Người khác sẽ thấy",
    previewEmpty: "Chưa có gì để chia sẻ: hãy để công khai ít nhất một cột mốc.",
    createLink: "Tạo liên kết chia sẻ",
    creating: "Đang tạo…",
    newLink: "Liên kết mới của bạn. Hãy sao chép ngay: liên kết chỉ hiện một lần.",
    copy: "Sao chép liên kết",
    copied: "Đã sao chép",
    linksHeading: "Các liên kết của bạn",
    noLinks: "Chưa có liên kết nào.",
    created: (date) => `Tạo ngày ${date}`,
    revoked: (date) => `Thu hồi ngày ${date}`,
    revoke: "Thu hồi",
    revokeConfirm: "Thu hồi liên kết này? Người đang giữ liên kết sẽ mất quyền xem ngay lập tức.",
    funnel: (visits, signups, paid) => `${visits} lượt xem · ${signups} đăng ký · ${paid} thành viên`,
    error: "Có lỗi xảy ra. Vui lòng thử lại.",
  },
  video: {
    heading: "Năm của bạn qua một video",
    intro: "Video dài 30 đến 60 giây từ các chương được chia sẻ, có phụ đề. Tệp ở chế độ riêng tư và được giữ 30 ngày.",
    formats: { "9x16": "Dọc 9:16", "16x9": "Ngang 16:9" },
    request: (format) => `Tạo video ${format}`,
    statuses: { queued: "Đang chờ", claimed: "Đang dựng", done: "Sẵn sàng", failed: "Thất bại", expired: "Hết hạn" },
    download: "Tải video",
    poster: "Tải ảnh tĩnh",
    expires: (date) => `Có thể tải đến ${date}`,
    none: "Chưa có video.",
    nothingToRender: "Hãy để công khai ít nhất một cột mốc và giữ chương đó hiển thị để tạo video.",
  },
};

export const yearReviewCopy: Record<PageLocale, YearReviewCopy> = { en, vi };

export function getYearReviewCopy(locale: string): YearReviewCopy {
  return yearReviewCopy[toPageLocale(locale)];
}

/** Roman numeral of a chapter (1–39), the atlas plate motif. */
export function romanNumeral(n: number): string {
  const tens = ["", "X", "XX", "XXX"][Math.floor(n / 10)] ?? "";
  const ones = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][n % 10];
  return tens + ones;
}
