import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { MissionKey, MissionStatus } from "@/lib/builder-league/missions";

/** Builder League missions and Ship Relay copy. */
export type MissionsCopy = {
  missions: Record<MissionKey, { title: string; outcome: string }>;
  status: Record<MissionStatus, string>;
  page: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    lede: string;
    nowIn: (stage: string) => string;
    cycle: (cycle: number) => string;
    loopedBack: string;
    nextHeading: string;
    allHeading: string;
    revisit: string;
    submit: string;
    doneOn: (date: string) => string;
    noPressure: string;
    stageHeading: Record<"validate" | "build" | "ship" | "contribute", string>;
  };
  relay: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    lede: string;
    logHelp: string;
    awaitingHeading: string;
    awaitingEmpty: string;
    awaitingFrom: (name: string) => string;
    confirm: string;
    confirming: string;
    confirmed: string;
    confirmError: string;
    givenHeading: string;
    givenEmpty: string;
    helped: (name: string) => string;
    confirmedBadge: string;
    waitingBadge: string;
    evidenceStatus: Record<"submitted" | "needs_info" | "approved" | "rejected" | "withdrawn", string>;
    feedHeading: string;
    feedEmpty: string;
    feedItem: (helper: string, helped: string) => string;
    someone: string;
    totals: (sessions: number, builders: number) => string;
    rules: string;
  };
};

export const missionsCopy: Record<PageLocale, MissionsCopy> = {
  en: {
    missions: {
      problem_discovery: { title: "Find a problem worth solving", outcome: "Evidence that a specific group has this problem today." },
      customer_interviews: { title: "Talk to the people who have it", outcome: "A round of interviews with notes on what you learned." },
      qualified_waitlist: { title: "Build a qualified waitlist", outcome: "People who match your target and asked to be told when it is ready." },
      willingness_to_pay: { title: "Test willingness to pay", outcome: "A pre-order, deposit, letter of intent or another real commitment." },
      scoped_mvp: { title: "Ship a scoped MVP", outcome: "The smallest version that solves the core problem, in real hands." },
      first_core_action: { title: "Get a first real user through the core action", outcome: "Someone outside your team used the main feature for real." },
      public_launch: { title: "Launch in public", outcome: "A public launch with a link people can use." },
      distribution_experiment: { title: "Run a distribution experiment", outcome: "One channel tried on purpose, with numbers and what you would change." },
      first_payment: { title: "Get the first payment", outcome: "A real customer paid. Not yourself, not refunded." },
      help_a_builder: { title: "Help another builder", outcome: "Feedback, a review or a pairing session the other builder confirms." },
      contributor_work: { title: "Contribute to the community", outcome: "Work for NLB or its members that a moderator can verify." },
    },
    status: { done: "Done", in_review: "In review", recommended: "Suggested next", available: "Open" },
    page: {
      metaTitle: "Missions · Builder League",
      metaDescription: "Suggested next outcomes based on your verified progress. Loops are normal: a pivot sends you back to validation.",
      eyebrow: "Plate II · Missions",
      title: "Your next useful outcome",
      lede: "Suggestions come from what has been verified so far. Nothing is locked, nothing expires and a pivot is a normal loop.",
      nowIn: (stage) => `Now in ${stage}`,
      cycle: (cycle) => `Idea cycle ${cycle}`,
      loopedBack: "You stopped or pivoted an idea. That is progress: the plan starts again at validation.",
      nextHeading: "Suggested next",
      allHeading: "Every mission",
      revisit: "Optional step back",
      submit: "Submit evidence",
      doneOn: (date) => `Verified ${date}`,
      noPressure: "No streaks and no deadlines. Quiet weeks do not cost you anything.",
      stageHeading: { validate: "Validate", build: "Build", ship: "Ship", contribute: "Contribute" },
    },
    relay: {
      metaTitle: "Ship Relay · Builder League",
      metaDescription: "Help other builders ship and get your help confirmed by the people you helped.",
      eyebrow: "Plate V · Ship Relay",
      title: "Pass the baton: help someone ship",
      lede: "Every confirmed hand-off counts for both of you. Help is confirmed by the builder you helped, never by yourself.",
      logHelp: "Log help you gave",
      awaitingHeading: "Waiting for your confirmation",
      awaitingEmpty: "Nobody is waiting for your confirmation.",
      awaitingFrom: (name) => `${name} says they helped you`,
      confirm: "Confirm this help",
      confirming: "Confirming…",
      confirmed: "Confirmed. Thank you.",
      confirmError: "Could not confirm. Try again.",
      givenHeading: "Help you gave",
      givenEmpty: "You have not logged help yet.",
      helped: (name) => `Helped ${name}`,
      confirmedBadge: "Confirmed",
      waitingBadge: "Waiting for confirmation",
      evidenceStatus: { submitted: "In review", needs_info: "Needs info", approved: "Verified", rejected: "Not accepted", withdrawn: "Withdrawn" },
      feedHeading: "Recent relays",
      feedEmpty: "No shared relays yet.",
      feedItem: (helper, helped) => `${helper} helped ${helped}`,
      someone: "A builder",
      totals: (sessions, builders) => `${sessions} confirmed ${sessions === 1 ? "hand-off" : "hand-offs"} across ${builders} ${builders === 1 ? "builder" : "builders"}`,
      rules: "Only help the other builder confirms counts. Names appear only when both builders allow peer mentions.",
    },
  },
  vi: {
    missions: {
      problem_discovery: { title: "Tìm một vấn đề đáng giải", outcome: "Bằng chứng cho thấy một nhóm người cụ thể đang gặp vấn đề này." },
      customer_interviews: { title: "Trò chuyện với người gặp vấn đề", outcome: "Một đợt phỏng vấn kèm ghi chép những gì bạn học được." },
      qualified_waitlist: { title: "Xây danh sách chờ đúng đối tượng", outcome: "Những người đúng chân dung khách hàng chủ động đăng ký chờ sản phẩm." },
      willingness_to_pay: { title: "Kiểm tra mức sẵn sàng chi trả", outcome: "Một đơn đặt trước, khoản cọc, thư cam kết hoặc cam kết thật khác." },
      scoped_mvp: { title: "Ra mắt một MVP gọn", outcome: "Phiên bản nhỏ nhất giải được vấn đề cốt lõi, đến tay người dùng thật." },
      first_core_action: { title: "Có người dùng thật đầu tiên dùng tính năng chính", outcome: "Một người ngoài nhóm đã dùng tính năng chính một cách thật sự." },
      public_launch: { title: "Ra mắt công khai", outcome: "Một lần ra mắt công khai với đường dẫn mọi người dùng được." },
      distribution_experiment: { title: "Chạy một thử nghiệm phân phối", outcome: "Thử một kênh có chủ đích, kèm số liệu và điều bạn sẽ thay đổi." },
      first_payment: { title: "Nhận khoản thanh toán đầu tiên", outcome: "Một khách hàng thật đã trả tiền. Không phải bạn, không bị hoàn tiền." },
      help_a_builder: { title: "Giúp một builder khác", outcome: "Góp ý, review hoặc buổi làm cùng mà builder kia xác nhận." },
      contributor_work: { title: "Đóng góp cho cộng đồng", outcome: "Công việc cho NLB hoặc thành viên mà moderator có thể xác minh." },
    },
    status: { done: "Đã xong", in_review: "Đang duyệt", recommended: "Gợi ý tiếp theo", available: "Đang mở" },
    page: {
      metaTitle: "Nhiệm vụ · Builder League",
      metaDescription: "Gợi ý kết quả tiếp theo dựa trên tiến độ đã xác minh. Vòng lặp là bình thường: xoay hướng sẽ đưa bạn về bước kiểm chứng.",
      eyebrow: "Bản II · Nhiệm vụ",
      title: "Kết quả hữu ích tiếp theo của bạn",
      lede: "Gợi ý dựa trên những gì đã được xác minh. Không có gì bị khóa, không có gì hết hạn, và xoay hướng là một vòng lặp bình thường.",
      nowIn: (stage) => `Đang ở giai đoạn ${stage}`,
      cycle: (cycle) => `Vòng ý tưởng ${cycle}`,
      loopedBack: "Bạn đã dừng hoặc xoay hướng một ý tưởng. Đó là tiến bộ: kế hoạch bắt đầu lại từ bước kiểm chứng.",
      nextHeading: "Gợi ý tiếp theo",
      allHeading: "Tất cả nhiệm vụ",
      revisit: "Có thể quay lại bước này",
      submit: "Gửi bằng chứng",
      doneOn: (date) => `Xác minh ngày ${date}`,
      noPressure: "Không có chuỗi ngày, không có hạn chót. Một tuần im ắng không làm bạn mất gì.",
      stageHeading: { validate: "Kiểm chứng", build: "Xây dựng", ship: "Ra mắt", contribute: "Đóng góp" },
    },
    relay: {
      metaTitle: "Ship Relay · Builder League",
      metaDescription: "Giúp các builder khác ra mắt sản phẩm và được chính người bạn giúp xác nhận.",
      eyebrow: "Bản V · Ship Relay",
      title: "Chuyền gậy: giúp ai đó ra mắt",
      lede: "Mỗi lần trao tay được xác nhận đều có ý nghĩa với cả hai người. Sự giúp đỡ do người được giúp xác nhận, không bao giờ do chính bạn.",
      logHelp: "Ghi lại sự giúp đỡ của bạn",
      awaitingHeading: "Đang chờ bạn xác nhận",
      awaitingEmpty: "Không ai đang chờ bạn xác nhận.",
      awaitingFrom: (name) => `${name} cho biết đã giúp bạn`,
      confirm: "Xác nhận sự giúp đỡ này",
      confirming: "Đang xác nhận…",
      confirmed: "Đã xác nhận. Cảm ơn bạn.",
      confirmError: "Chưa xác nhận được. Hãy thử lại.",
      givenHeading: "Những lần bạn đã giúp",
      givenEmpty: "Bạn chưa ghi lại lần giúp đỡ nào.",
      helped: (name) => `Đã giúp ${name}`,
      confirmedBadge: "Đã xác nhận",
      waitingBadge: "Đang chờ xác nhận",
      evidenceStatus: { submitted: "Đang duyệt", needs_info: "Cần bổ sung", approved: "Đã xác minh", rejected: "Không được chấp nhận", withdrawn: "Đã rút" },
      feedHeading: "Những lần chuyền gậy gần đây",
      feedEmpty: "Chưa có lần chuyền gậy nào được chia sẻ.",
      feedItem: (helper, helped) => `${helper} đã giúp ${helped}`,
      someone: "Một builder",
      totals: (sessions, builders) => `${sessions} lần trao tay đã xác nhận giữa ${builders} builder`,
      rules: "Chỉ những lần giúp được builder kia xác nhận mới được tính. Tên chỉ hiện khi cả hai builder cho phép được nhắc tên.",
    },
  },
};

export function getMissionsCopy(locale: string): MissionsCopy {
  return missionsCopy[toPageLocale(locale)];
}
