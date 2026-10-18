import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { SeasonTrack } from "@/lib/builder-league/seasons";
import type { BoardKey, Visibility } from "@/lib/builder-league/types";

/** Builder League seasons and Time Capsule copy. */
export type SeasonsCopy = {
  tracks: Record<SeasonTrack, { label: string; hint: string }>;
  page: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    lede: string;
    seasonName: (number: number) => string;
    status: Record<"upcoming" | "active" | "ended", string>;
    weekOf: (week: number, weeks: number) => string;
    dates: (start: string, end: string) => string;
    joinHeading: string;
    joinedHeading: string;
    joinBody: string;
    trackLabel: string;
    goalLabel: string;
    goalHint: string;
    join: string;
    update: string;
    saving: string;
    saved: string;
    saveError: string;
    checkInHeading: string;
    checkInBody: string;
    checkInEmpty: string;
    weekLabel: (week: number) => string;
    quiet: string;
    inReview: (count: number) => string;
    thisWeek: string;
    archiveHeading: string;
    archiveEmpty: string;
    myPlace: (board: string, place: number, entrants: number) => string;
    notPlaced: string;
    boards: (count: number) => string;
    revision: (revision: number) => string;
    fairness: string;
    boardNames: Record<BoardKey, string>;
  };
  capsule: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    lede: string;
    yearLabel: string;
    intentHeading: string;
    intentHint: string;
    reflectionHeading: string;
    reflectionHint: string;
    visibilityLabel: string;
    visibility: Record<Visibility, string>;
    save: string;
    saving: string;
    saved: string;
    saveError: string;
    version: (version: number, date: string) => string;
    historyHeading: string;
    historyEmpty: string;
    /** `used` may be a placeholder such as "{used}" that a client component fills in. */
    characters: (used: number | string, max: number) => string;
    privacyNote: string;
  };
};

export const seasonsCopy: Record<PageLocale, SeasonsCopy> = {
  en: {
    tracks: {
      open: { label: "Open", hint: "Any stage, whatever moves your project." },
      validate: { label: "Validate", hint: "Problems, interviews, commitments." },
      build: { label: "Build", hint: "Scope, MVP, first real users." },
      ship: { label: "Ship", hint: "Launch, distribution, first payment." },
      contribute: { label: "Contribute", hint: "Help, reviews and community work." },
    },
    page: {
      metaTitle: "Seasons · Builder League",
      metaDescription: "Eight-week Builder League seasons with optional tracks, a soft weekly check-in and archived results.",
      eyebrow: "Plate III · Seasons",
      title: "Eight weeks, one goal you choose",
      lede: "A season is eight weeks. Pick a track and a goal if it helps; your score counts the same either way.",
      seasonName: (number) => `Season ${number}`,
      status: { upcoming: "Starts soon", active: "Running", ended: "Ended" },
      weekOf: (week, weeks) => `Week ${week} of ${weeks}`,
      dates: (start, end) => `${start} – ${end} (Vietnam time)`,
      joinHeading: "Join this season",
      joinedHeading: "Your season",
      joinBody: "Joining is optional. It adds a track and a goal to your check-ins; it never changes how you are scored.",
      trackLabel: "Track",
      goalLabel: "Goal for these eight weeks (optional)",
      goalHint: "One sentence, for example: talk to 10 restaurant owners.",
      join: "Join season",
      update: "Update track and goal",
      saving: "Saving…",
      saved: "Saved.",
      saveError: "Could not save. Try again.",
      checkInHeading: "Weekly check-in",
      checkInBody: "A quiet summary of what was verified each week. Quiet weeks are fine; nothing is lost.",
      checkInEmpty: "The season has not started yet.",
      weekLabel: (week) => `Week ${week}`,
      quiet: "Quiet week",
      inReview: (count) => `${count} in review`,
      thisWeek: "This week",
      archiveHeading: "Past seasons",
      archiveEmpty: "No season has been finalised yet.",
      myPlace: (board, place, entrants) => `${board}: #${place} of ${entrants}`,
      notPlaced: "You were not on a final board this season.",
      boards: (count) => `${count} final ${count === 1 ? "board" : "boards"}`,
      revision: (revision) => `revision ${revision}`,
      fairness: "Tracks group people working on similar things. They never add points; League Score uses the same caps and weights for everyone.",
      boardNames: { overall: "Overall", validate: "Validate", build: "Build", ship: "Ship", contribute: "Contribute", rising: "Rising", newcomers: "Newcomers" },
    },
    capsule: {
      metaTitle: "Time Capsule · Builder League",
      metaDescription: "Write your intent for the year and a reflection at the end. Private unless you share it.",
      eyebrow: "Plate VII · Time Capsule",
      title: "Write to the builder you will be in December",
      lede: "Set an intent for the year, then come back and reflect. Every edit is kept as a new version.",
      yearLabel: "Year",
      intentHeading: "Intent",
      intentHint: "What do you want to have proven by the end of the year?",
      reflectionHeading: "Reflection",
      reflectionHint: "What happened, what surprised you, what will you do differently?",
      visibilityLabel: "Who can read this",
      visibility: { private: "Only me", community: "Builder League members", public: "Anyone" },
      save: "Save new version",
      saving: "Saving…",
      saved: "Saved as a new version.",
      saveError: "Could not save. Try again.",
      version: (version, date) => `Version ${version} · ${date}`,
      historyHeading: "Earlier versions",
      historyEmpty: "No earlier versions.",
      characters: (used, max) => `${used} / ${max} characters`,
      privacyNote: "Entries are private by default. Older versions are only ever visible to you.",
    },
  },
  vi: {
    tracks: {
      open: { label: "Tự do", hint: "Mọi giai đoạn, miễn đẩy dự án đi tới." },
      validate: { label: "Kiểm chứng", hint: "Vấn đề, phỏng vấn, cam kết." },
      build: { label: "Xây dựng", hint: "Phạm vi, MVP, người dùng thật đầu tiên." },
      ship: { label: "Ra mắt", hint: "Ra mắt, phân phối, khoản thanh toán đầu tiên." },
      contribute: { label: "Đóng góp", hint: "Giúp đỡ, review và việc cho cộng đồng." },
    },
    page: {
      metaTitle: "Mùa giải · Builder League",
      metaDescription: "Mùa giải Builder League kéo dài tám tuần, có nhánh tùy chọn, bản tổng kết tuần nhẹ nhàng và kết quả được lưu trữ.",
      eyebrow: "Bản III · Mùa giải",
      title: "Tám tuần, một mục tiêu do bạn chọn",
      lede: "Mỗi mùa kéo dài tám tuần. Chọn nhánh và mục tiêu nếu thấy có ích; điểm của bạn được tính như nhau dù chọn hay không.",
      seasonName: (number) => `Mùa ${number}`,
      status: { upcoming: "Sắp bắt đầu", active: "Đang diễn ra", ended: "Đã kết thúc" },
      weekOf: (week, weeks) => `Tuần ${week}/${weeks}`,
      dates: (start, end) => `${start} – ${end} (giờ Việt Nam)`,
      joinHeading: "Tham gia mùa này",
      joinedHeading: "Mùa của bạn",
      joinBody: "Tham gia là tùy chọn. Việc này thêm nhánh và mục tiêu vào bản tổng kết tuần; không bao giờ thay đổi cách tính điểm.",
      trackLabel: "Nhánh",
      goalLabel: "Mục tiêu cho tám tuần này (tùy chọn)",
      goalHint: "Một câu thôi, ví dụ: trò chuyện với 10 chủ nhà hàng.",
      join: "Tham gia mùa",
      update: "Cập nhật nhánh và mục tiêu",
      saving: "Đang lưu…",
      saved: "Đã lưu.",
      saveError: "Chưa lưu được. Hãy thử lại.",
      checkInHeading: "Tổng kết hằng tuần",
      checkInBody: "Bản tóm tắt nhẹ nhàng những gì đã được xác minh mỗi tuần. Tuần im ắng cũng không sao; bạn không mất gì.",
      checkInEmpty: "Mùa giải chưa bắt đầu.",
      weekLabel: (week) => `Tuần ${week}`,
      quiet: "Tuần im ắng",
      inReview: (count) => `${count} đang duyệt`,
      thisWeek: "Tuần này",
      archiveHeading: "Các mùa trước",
      archiveEmpty: "Chưa có mùa nào được chốt kết quả.",
      myPlace: (board, place, entrants) => `${board}: hạng ${place}/${entrants}`,
      notPlaced: "Bạn không có tên trên bảng chốt của mùa này.",
      boards: (count) => `${count} bảng đã chốt`,
      revision: (revision) => `bản sửa ${revision}`,
      fairness: "Nhánh gom những người đang làm việc giống nhau. Nhánh không cộng điểm; League Score dùng cùng giới hạn và trọng số cho mọi người.",
      boardNames: { overall: "Tổng", validate: "Kiểm chứng", build: "Xây dựng", ship: "Ra mắt", contribute: "Đóng góp", rising: "Đang lên", newcomers: "Người mới" },
    },
    capsule: {
      metaTitle: "Hộp thời gian · Builder League",
      metaDescription: "Viết dự định cho năm và lời nhìn lại vào cuối năm. Riêng tư trừ khi bạn chia sẻ.",
      eyebrow: "Bản VII · Hộp thời gian",
      title: "Viết cho chính bạn của tháng Mười Hai",
      lede: "Đặt dự định cho năm nay, rồi quay lại để nhìn lại. Mỗi lần sửa được lưu thành một phiên bản mới.",
      yearLabel: "Năm",
      intentHeading: "Dự định",
      intentHint: "Đến cuối năm, bạn muốn đã chứng minh được điều gì?",
      reflectionHeading: "Nhìn lại",
      reflectionHint: "Điều gì đã xảy ra, điều gì khiến bạn bất ngờ, bạn sẽ làm khác đi điều gì?",
      visibilityLabel: "Ai được đọc",
      visibility: { private: "Chỉ mình tôi", community: "Thành viên Builder League", public: "Mọi người" },
      save: "Lưu phiên bản mới",
      saving: "Đang lưu…",
      saved: "Đã lưu thành phiên bản mới.",
      saveError: "Chưa lưu được. Hãy thử lại.",
      version: (version, date) => `Phiên bản ${version} · ${date}`,
      historyHeading: "Các phiên bản trước",
      historyEmpty: "Chưa có phiên bản trước.",
      characters: (used, max) => `${used} / ${max} ký tự`,
      privacyNote: "Mặc định mọi mục đều riêng tư. Các phiên bản cũ chỉ mình bạn xem được.",
    },
  },
};

export function getSeasonsCopy(locale: string): SeasonsCopy {
  return seasonsCopy[toPageLocale(locale)];
}
