import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { RankRequirementKey } from "@/lib/builder-league/scoring";

export type PrivacySwitch ="leaderboardPublic" | "passportPublic" | "wrappedPublic" | "peerMentionsOk" | "backfillOptIn" | "redactFinancials";

/** Builder League member home (`/builder-league`) and privacy settings (`/builder-league/settings`). */
export interface HomeCopy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lede: string;
  level: { label: string; value: (level: number) => string; rpToNext: (rp: number) => string; max: string; rp: (rp: number) => string };
  rank: {
    label: string;
    since: (date: string) => string;
    eligibleNote: string;
    inactive: string;
    nextTitle: (rank: string) => string;
    atTop: string;
    requirement: Record<RankRequirementKey, (required: number | boolean, actual: number | boolean) => string>;
    met: string;
    notMet: string;
  };
  week: { label: string; unit: string };
  checklist: { title: string; privacy: string; evidence: string; mission: string; journey: string };
  links: {
    title: string;
    missions: { label: string; desc: string };
    evidence: { label: string; desc: (pending: number) => string };
    journey: { label: string; desc: string };
    leaderboards: { label: string; desc: string };
    passport: { label: string; desc: string };
    settings: { label: string; desc: string };
  };
  signIn: { title: string; desc: string; cta: string };
  membership: { title: string; desc: string; cta: string };
  settings: {
    metaTitle: string;
    eyebrow: string;
    title: string;
    lede: string;
    switches: Record<PrivacySwitch, { label: string; desc: string }>;
    on: string;
    off: string;
    save: string;
    saved: string;
    back: string;
    data: {
      title: string;
      lede: string;
      exportLabel: string;
      exportDesc: string;
      deleteTitle: string;
      deleteDesc: string;
      deleteKeeps: string;
      confirmLabel: (word: string) => string;
      deleteCta: string;
      deleted: string;
      adminNote: string;
      errors: Record<"confirm" | "admin" | "rate" | "storage" | "failed", string>;
    };
  };
  ogTitle: string;
  ogSubtitle: string;
}

const pct = (value: number | boolean) => `${Math.round(Number(value) * 100)}%`;

const en: HomeCopy = {
  metaTitle: "Builder League",
  metaDescription: "Your level, rank and verified progress in the Next Level Builders Builder League.",
  eyebrow: "Builder League",
  title: "Your next point of light.",
  lede: "Level grows with every verified award. Rank is earned only when every gate is met, and it never drops on its own.",
  level: {
    label: "Level",
    value: (level) => `Level ${level}`,
    rpToNext: (rp) => `${rp} RP to the next level`,
    max: "Top level reached",
    rp: (rp) => `${rp} RP`,
  },
  rank: {
    label: "Rank",
    since: (date) => `Held since ${date}`,
    eligibleNote: "Every gate is met. The rank is awarded at the next weekly review.",
    inactive: "No verified activity for 90 days. Your rank stays; the inactive mark clears with your next verified work.",
    nextTitle: (rank) => `Towards ${rank}`,
    atTop: "You hold the highest rank.",
    requirement: {
      rp: (required, actual) => `${actual} of ${required} RP`,
      tenure_days: (required, actual) => `${actual} of ${required} days as a member`,
      ship_or_contributor: (required, actual) => `${actual} of ${required} verified ships (or approved contributor weeks)`,
      feedback_rate: (required, actual) => `Weekly feedback in ${pct(actual)} of weeks (needs ${pct(required)})`,
      weekly_check_ins: (required, actual) => `${actual} of ${required} active weeks`,
      people_helped: (required, actual) => `${actual} of ${required} people helped`,
      highlighted_posts: (required, actual) => `${actual} of ${required} highlighted posts`,
      featured_or_contributor: () => "A featured contribution or approved contributor work",
      mentor_nominations: (required, actual) => `${actual} of ${required} mentor nominations this year`,
      member_quota: () => "Room within the rank's share of members",
    },
    met: "Met",
    notMet: "Not yet",
  },
  week: { label: "This week", unit: "league points" },
  checklist: {
    title: "Getting started",
    privacy: "Choose what others can see",
    evidence: "Submit your first evidence",
    mission: "Pick a mission for this week",
    journey: "Review your journey",
  },
  links: {
    title: "Your league",
    missions: { label: "Missions", desc: "This week's missions by stage." },
    evidence: { label: "Evidence", desc: (pending) => (pending === 0 ? "Nothing waiting for review." : pending === 1 ? "1 item waiting for review." : `${pending} items waiting for review.`) },
    journey: { label: "Journey", desc: "Every verified step, in order." },
    leaderboards: { label: "Boards", desc: "Your position this week, month and season." },
    passport: { label: "Passport", desc: "Your builder passport, as you see it." },
    settings: { label: "Privacy", desc: "Everything is private until you opt in." },
  },
  signIn: { title: "Sign in to the Builder League", desc: "Your level, rank and boards are tied to your account.", cta: "Sign in" },
  membership: {
    title: "The Builder League is for members",
    desc: "Premium and VIP members score the same way. Join to start earning verified rank.",
    cta: "See membership",
  },
  settings: {
    metaTitle: "Builder League privacy",
    eyebrow: "Builder League · privacy",
    title: "You decide what is public.",
    lede: "Everything starts private. Your scores still count while hidden; switching a surface off removes you from it immediately.",
    switches: {
      leaderboardPublic: { label: "Show me on public boards", desc: "Your name, photo and score appear on Builder League boards. You always see your own position." },
      passportPublic: { label: "Publish my passport", desc: "Adds your verified milestones, badges and public projects to your builder profile. Private evidence never appears." },
      wrappedPublic: { label: "Share my season recap", desc: "Lets others open your season and year recap pages." },
      peerMentionsOk: { label: "Allow peer mentions", desc: "Other members may name you as the person they helped or were helped by." },
      backfillOptIn: { label: "Count earlier work", desc: "Lets moderators add verified work from before the league started." },
      redactFinancials: { label: "Hide payment details", desc: "Keeps titles and links of payment and commitment milestones off public pages." },
    },
    on: "On",
    off: "Off",
    save: "Save privacy settings",
    saved: "Saved.",
    back: "Back to the Builder League",
    data: {
      title: "Take your data with you, or erase it.",
      lede: "Download everything the league stores about you, or delete it yourself. Your account stays.",
      exportLabel: "Export my data",
      exportDesc: "One JSON file with your evidence, points history, badges, ranks, seasons, rewards and settings.",
      deleteTitle: "Delete my Builder League data",
      deleteDesc: "Removes your evidence files, projects, badges, ranks, season entries, reward claims, Time Capsule notes and yearly recaps. This cannot be undone.",
      deleteKeeps: "Final boards keep their totals under an anonymous id that no longer links to you. Export first if you want a copy.",
      confirmLabel: (word) => `Type ${word} to confirm`,
      deleteCta: "Delete my league data",
      deleted: "Your Builder League data has been deleted.",
      adminNote: "Admins cannot delete their own league data here. Ask another admin to run the request.",
      errors: {
        confirm: "Type the confirmation word exactly as shown.",
        admin: "Admins cannot delete their own league data. Ask another admin.",
        rate: "Too many requests. Wait a minute and try again.",
        storage: "Your files could not be deleted, so nothing was changed. Try again.",
        failed: "Something went wrong. Try again; repeating the request is safe.",
      },
    },
  },
  ogTitle: "Builder League",
  ogSubtitle: "Verified progress, levels and ranks for Next Level Builders members.",
};

const vi: HomeCopy = {
  metaTitle: "Builder League",
  metaDescription: "Cấp độ, hạng và tiến độ đã xác minh của bạn trong Builder League của Next Level Builders.",
  eyebrow: "Builder League",
  title: "Điểm sáng tiếp theo của bạn.",
  lede: "Cấp độ tăng theo từng điểm thưởng đã xác minh. Hạng chỉ được trao khi đạt mọi điều kiện, và không tự tụt xuống.",
  level: {
    label: "Cấp độ",
    value: (level) => `Cấp ${level}`,
    rpToNext: (rp) => `Còn ${rp} RP để lên cấp`,
    max: "Đã đạt cấp cao nhất",
    rp: (rp) => `${rp} RP`,
  },
  rank: {
    label: "Hạng",
    since: (date) => `Giữ từ ${date}`,
    eligibleNote: "Bạn đã đạt mọi điều kiện. Hạng sẽ được trao ở lần xét hằng tuần tới.",
    inactive: "Đã 90 ngày chưa có hoạt động được xác minh. Hạng vẫn giữ nguyên; nhãn tạm nghỉ sẽ mất khi có công việc mới được xác minh.",
    nextTitle: (rank) => `Hướng tới ${rank}`,
    atTop: "Bạn đang giữ hạng cao nhất.",
    requirement: {
      rp: (required, actual) => `${actual} / ${required} RP`,
      tenure_days: (required, actual) => `${actual} / ${required} ngày là thành viên`,
      ship_or_contributor: (required, actual) => `${actual} / ${required} lần phát hành đã xác minh (hoặc tuần contributor được duyệt)`,
      feedback_rate: (required, actual) => `Góp ý hằng tuần ở ${pct(actual)} số tuần (cần ${pct(required)})`,
      weekly_check_ins: (required, actual) => `${actual} / ${required} tuần hoạt động`,
      people_helped: (required, actual) => `${actual} / ${required} người đã giúp`,
      highlighted_posts: (required, actual) => `${actual} / ${required} bài được nổi bật`,
      featured_or_contributor: () => "Một đóng góp được nổi bật hoặc công việc contributor được duyệt",
      mentor_nominations: (required, actual) => `${actual} / ${required} đề cử của mentor trong năm nay`,
      member_quota: () => "Còn chỗ trong tỷ lệ thành viên của hạng",
    },
    met: "Đạt",
    notMet: "Chưa đạt",
  },
  week: { label: "Tuần này", unit: "điểm league" },
  checklist: {
    title: "Bắt đầu",
    privacy: "Chọn những gì người khác được thấy",
    evidence: "Nộp bằng chứng đầu tiên",
    mission: "Chọn nhiệm vụ cho tuần này",
    journey: "Xem lại hành trình",
  },
  links: {
    title: "League của bạn",
    missions: { label: "Nhiệm vụ", desc: "Nhiệm vụ tuần này theo từng giai đoạn." },
    evidence: { label: "Bằng chứng", desc: (pending) => (pending === 0 ? "Không có mục nào đang chờ duyệt." : `${pending} mục đang chờ duyệt.`) },
    journey: { label: "Hành trình", desc: "Mọi bước đã xác minh, theo thứ tự." },
    leaderboards: { label: "Bảng xếp hạng", desc: "Vị trí của bạn trong tuần, tháng và mùa." },
    passport: { label: "Hộ chiếu", desc: "Hộ chiếu builder của bạn, ở chế độ bạn thấy." },
    settings: { label: "Quyền riêng tư", desc: "Mọi thứ đều riêng tư cho đến khi bạn bật." },
  },
  signIn: { title: "Đăng nhập vào Builder League", desc: "Cấp độ, hạng và bảng xếp hạng gắn với tài khoản của bạn.", cta: "Đăng nhập" },
  membership: {
    title: "Builder League dành cho thành viên",
    desc: "Thành viên Premium và VIP được tính điểm như nhau. Tham gia để bắt đầu có hạng đã xác minh.",
    cta: "Xem gói thành viên",
  },
  settings: {
    metaTitle: "Quyền riêng tư Builder League",
    eyebrow: "Builder League · quyền riêng tư",
    title: "Bạn quyết định điều gì được công khai.",
    lede: "Mọi thứ bắt đầu ở chế độ riêng tư. Điểm vẫn được tính khi ẩn; tắt một mục sẽ gỡ bạn khỏi mục đó ngay lập tức.",
    switches: {
      leaderboardPublic: { label: "Hiện tôi trên bảng công khai", desc: "Tên, ảnh và điểm của bạn xuất hiện trên bảng Builder League. Bạn luôn thấy vị trí của chính mình." },
      passportPublic: { label: "Công khai hộ chiếu", desc: "Thêm cột mốc đã xác minh, huy hiệu và dự án công khai vào hồ sơ builder. Bằng chứng riêng tư không bao giờ hiện." },
      wrappedPublic: { label: "Chia sẻ tổng kết mùa", desc: "Cho phép người khác mở trang tổng kết mùa và năm của bạn." },
      peerMentionsOk: { label: "Cho phép nhắc tên", desc: "Thành viên khác có thể ghi tên bạn là người họ đã giúp hoặc được giúp." },
      backfillOptIn: { label: "Tính cả công việc trước đây", desc: "Cho phép moderator thêm công việc đã xác minh từ trước khi league bắt đầu." },
      redactFinancials: { label: "Ẩn chi tiết thanh toán", desc: "Giữ tiêu đề và liên kết của cột mốc thanh toán, cam kết trả tiền ngoài trang công khai." },
    },
    on: "Bật",
    off: "Tắt",
    save: "Lưu cài đặt quyền riêng tư",
    saved: "Đã lưu.",
    back: "Quay lại Builder League",
    data: {
      title: "Mang dữ liệu đi, hoặc xoá hẳn.",
      lede: "Tải về mọi thứ league lưu về bạn, hoặc tự xoá. Tài khoản của bạn vẫn được giữ.",
      exportLabel: "Xuất dữ liệu của tôi",
      exportDesc: "Một tệp JSON gồm bằng chứng, lịch sử điểm, huy hiệu, hạng, mùa giải, phần thưởng và cài đặt của bạn.",
      deleteTitle: "Xoá dữ liệu Builder League của tôi",
      deleteDesc: "Xoá tệp bằng chứng, dự án, huy hiệu, hạng, đăng ký mùa, yêu cầu phần thưởng, ghi chú Time Capsule và tổng kết năm. Không thể hoàn tác.",
      deleteKeeps: "Bảng xếp hạng đã chốt vẫn giữ tổng điểm dưới một mã ẩn danh, không còn liên kết với bạn. Hãy xuất dữ liệu trước nếu muốn giữ bản sao.",
      confirmLabel: (word) => `Gõ ${word} để xác nhận`,
      deleteCta: "Xoá dữ liệu league",
      deleted: "Dữ liệu Builder League của bạn đã được xoá.",
      adminNote: "Admin không thể tự xoá dữ liệu league của mình tại đây. Hãy nhờ một admin khác thực hiện.",
      errors: {
        confirm: "Hãy gõ đúng từ xác nhận như hướng dẫn.",
        admin: "Admin không thể tự xoá dữ liệu league của mình. Hãy nhờ một admin khác.",
        rate: "Quá nhiều yêu cầu. Chờ một phút rồi thử lại.",
        storage: "Chưa xoá được tệp của bạn nên chưa có gì thay đổi. Hãy thử lại.",
        failed: "Đã có lỗi. Hãy thử lại; gửi lại yêu cầu là an toàn.",
      },
    },
  },
  ogTitle: "Builder League",
  ogSubtitle: "Tiến độ, cấp độ và hạng đã xác minh của thành viên Next Level Builders.",
};

export const homeCopy: Record<PageLocale, HomeCopy> = { en, vi };

export function getHomeCopy(locale: string): HomeCopy {
  return homeCopy[toPageLocale(locale)];
}
