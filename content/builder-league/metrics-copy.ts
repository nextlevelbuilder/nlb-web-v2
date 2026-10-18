import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { ClaimStatus, DistributionCohortKey, FirstSignalKey } from "@/lib/builder-league/metrics";

/** Builder League tracking dashboard copy (admin studio). */
export type MetricsCopy = {
  meta: { title: string };
  plate: string;
  eyebrow: string;
  title: string;
  lede: string;
  back: string;
  adminOnly: string;
  form: { legend: string; from: string; to: string; apply: string; hint: (days: number) => string; invalid: string };
  window: (from: string, to: string, days: number) => string;
  generated: (at: string) => string;
  activeMembers: (count: number) => string;
  notYet: string;
  none: string;
  noData: string;
  columns: {
    period: string;
    range: string;
    members: string;
    rate: string;
    count: string;
    cohort: string;
    size: string;
    reward: string;
    remaining: string;
    capacity: string;
    claims: string;
    redeemed: string;
    held: string;
    step: string;
    value: string;
    code: string;
    median: string;
    p25: string;
    p75: string;
    max: string;
    scored: string;
    signal: string;
    reached: string;
    medianDays: string;
    spread: string;
    before: string;
    after: string;
    measure: string;
    unlimited: string;
  };
  northStar: {
    title: string;
    basis: (days: number) => string;
    reached: string;
    pending: (pending: number, early: number) => string;
  };
  timeToFirst: {
    title: string;
    basis: string;
    signals: Record<FirstSignalKey, string>;
    days: (value: string) => string;
  };
  activity: { title: string; basis: string; weeks: string; months: string };
  peerHelp: {
    title: string;
    basis: string;
    confirmedApproved: string;
    submitted: string;
    confirmed: string;
    approved: string;
    rejected: string;
    open: string;
    withdrawn: string;
    helpers: string;
    helped: string;
    reciprocal: string;
    reciprocalHint: string;
  };
  retention: { title: string; basis: string; offset: (n: number) => string };
  rewards: { title: string; basis: string; total: string; capacityUsed: string; statuses: Record<ClaimStatus, string> };
  integrity: {
    title: string;
    basis: string;
    rejection: string;
    reversals: string;
    reversedRp: (rp: number) => string;
    reasonsTitle: string;
    appealsTitle: string;
    appeals: { opened: string; open: string; upheld: string; overturned: string; withdrawn: string };
  };
  wrapped: {
    title: string;
    basis: string;
    completed: string;
    shared: string;
    visits: string;
    signups: string;
    paid: string;
  };
  distribution: {
    title: string;
    basis: (newcomerDays: number, share: number) => string;
    cohorts: Record<DistributionCohortKey, string>;
  };
  pilot: {
    title: string;
    basis: (weeks: number) => string;
    caveat: string;
    summary: (enrolled: number, evaluated: number, pending: number) => string;
    withEvent: string;
    events: string;
    imported: string;
    mean: string;
    median: string;
    improved: string;
    unchanged: string;
    declined: string;
  };
};

const en: MetricsCopy = {
  meta: { title: "Builder League metrics" },
  plate: "METRICS",
  eyebrow: "Builder League · Tracking",
  title: "Is the league helping builders progress?",
  lede: "Counts come straight from the league tables for the window you pick. Every rate shows its numerator and denominator; small counts are shown as they are, so read them with care.",
  back: "Back to the league admin",
  adminOnly: "Admins only. Small groups are not suppressed here, so do not copy these numbers to public pages.",
  form: {
    legend: "Window (Asia/Ho_Chi_Minh dates)",
    from: "From",
    to: "To",
    apply: "Show metrics",
    hint: (days) => `Up to ${days} days. Both dates are included.`,
    invalid: "That window is not valid, so the default window is shown.",
  },
  window: (from, to, days) => `Window ${from} → ${to} (${days} days)`,
  generated: (at) => `Computed ${at}`,
  activeMembers: (count) => `${count} active members (pilot or season, at least one submission) by the window end`,
  notYet: "Not yet",
  none: "—",
  noData: "No data in this window.",
  columns: {
    period: "Period",
    range: "Dates",
    members: "Members",
    rate: "Rate",
    count: "Count",
    cohort: "Cohort",
    size: "Size",
    reward: "Reward",
    remaining: "Left",
    capacity: "Capacity",
    claims: "Claims in window",
    redeemed: "Redeemed",
    held: "Held now",
    step: "Step",
    value: "Value",
    code: "Reason code",
    median: "Median RP",
    p25: "25th pct",
    p75: "75th pct",
    max: "Max",
    scored: "Scored",
    signal: "Signal",
    reached: "Reached",
    medianDays: "Median days",
    spread: "Fastest – slowest",
    before: "Before",
    after: "After",
    measure: "Measure",
    unlimited: "Unlimited",
  },
  northStar: {
    title: "North star: verified progress within 90 days",
    basis: (days) =>
      `Members whose first submission falls in the window and who had a VALIDATE, BUILD or SHIP event verified within ${days} days of it. Only members whose ${days} days have passed are in the rate.`,
    reached: "Reached verified progress",
    pending: (pending, early) => `${pending} members are still inside their first ${pending === 1 ? "window" : "windows"}; ${early} of them already reached it.`,
  },
  timeToFirst: {
    title: "Time to first problem signal and first customer",
    basis: "Members whose first submission falls in the window. Days run from that submission to the moment the first matching event was verified.",
    signals: {
      problem_signal: "Problem signal (validate_problem_signal)",
      customer_or_payment: "First real user or first payment",
    },
    days: (value) => `${value} days`,
  },
  activity: {
    title: "Meaningful activity rate",
    basis: "Active members with at least one event verified in the period, out of the active members who had started by the period end. The latest 12 periods in the window.",
    weeks: "Weeks",
    months: "Months",
  },
  peerHelp: {
    title: "Peer-help outcomes",
    basis: "Peer-help submissions created in the window, by what happened to them.",
    confirmedApproved: "Confirmed by the person helped and approved",
    submitted: "Submitted",
    confirmed: "Confirmed",
    approved: "Approved",
    rejected: "Rejected",
    open: "Still open",
    withdrawn: "Withdrawn",
    helpers: "Members who helped",
    helped: "Members helped",
    reciprocal: "Pairs confirming each other",
    reciprocalHint: "Two members who confirmed help for each other in the window. Not proof of gaming, but worth a look.",
  },
  retention: {
    title: "Participation and retention by cohort",
    basis: "Cohort = month of the first submission (in the window). A member counts in a later month when they submitted evidence that month.",
    offset: (n) => `Month +${n}`,
  },
  rewards: {
    title: "Reward claims and redemption",
    basis: "Claims created in the window by status. Left is the stock now; capacity adds back units held by open claims and redeemed claims.",
    total: "Redeemed out of all claims in the window",
    capacityUsed: "Redeemed out of total capacity (limited rewards, all time)",
    statuses: {
      requested: "Requested",
      approved: "Approved",
      rejected: "Rejected",
      redeemed: "Redeemed",
      expired: "Expired",
      cancelled: "Cancelled",
    },
  },
  integrity: {
    title: "Rejections, reversals and appeals",
    basis: "Evidence decided in the window, ledger entries written in the window, appeals opened in the window.",
    rejection: "Rejected out of approved and rejected",
    reversals: "Reversals out of awards",
    reversedRp: (rp) => `${rp} RP reversed`,
    reasonsTitle: "Rejection reasons",
    appealsTitle: "Appeals",
    appeals: { opened: "Opened", open: "Open", upheld: "Upheld", overturned: "Overturned", withdrawn: "Withdrawn" },
  },
  wrapped: {
    title: "Year in Review: completion, sharing and conversion",
    basis: "Year in Review snapshots and share links created in the window, and visits, signups and paid memberships attributed to those links in the window.",
    completed: "Members with a Year in Review",
    shared: "Of those, members who shared it",
    visits: "Visits on shared links",
    signups: "Signups per visit",
    paid: "Paid memberships per signup",
  },
  distribution: {
    title: "RP distribution across cohorts",
    basis: (days, share) =>
      `Net RP earned in the window (reversals included) by active members. Newcomers started within ${days} days of the window end. A stage specialist earned at least ${Math.round(share * 100)}% of their RP in one stage. Contributors earned any CONTRIBUTE RP. Compare the medians to see whether one kind of builder is left behind.`,
    cohorts: {
      all: "All active members",
      newcomers: "Newcomers",
      established: "Established",
      specialist_validate: "VALIDATE specialists",
      specialist_build: "BUILD specialists",
      specialist_ship: "SHIP specialists",
      specialist_contribute: "CONTRIBUTE specialists",
      contributors: "Contributors",
    },
  },
  pilot: {
    title: "Pilot evaluation: before and after enrollment",
    basis: (weeks) =>
      `Members who joined the pilot or a season in the window (whichever came first). For each, verified events dated in the ${weeks} weeks before enrollment are compared with the ${weeks} weeks after. Members whose ${weeks} weeks after have not passed are left out.`,
    caveat:
      "Members could not submit before they enrolled, so the before side only holds back-dated evidence and imported records. Read it as a lower bound, not a control group.",
    summary: (enrolled, evaluated, pending) => `${enrolled} enrolled in the window · ${evaluated} evaluated · ${pending} still inside their after window`,
    withEvent: "Members with a verified event",
    events: "Verified events",
    imported: "Of which imported",
    mean: "Mean per member",
    median: "Median per member",
    improved: "More events after",
    unchanged: "Same",
    declined: "Fewer events after",
  },
};

const vi: MetricsCopy = {
  meta: { title: "Chỉ số Builder League" },
  plate: "CHỈ SỐ",
  eyebrow: "Builder League · Theo dõi",
  title: "League có đang giúp builder tiến lên không?",
  lede: "Số liệu lấy thẳng từ các bảng của league trong khoảng thời gian bạn chọn. Mỗi tỷ lệ đều ghi rõ tử số và mẫu số; nhóm nhỏ vẫn hiện đúng con số, nên hãy đọc cẩn thận.",
  back: "Quay lại trang quản trị league",
  adminOnly: "Chỉ dành cho quản trị viên. Trang này không ẩn nhóm nhỏ, vì vậy đừng chép các con số này lên trang công khai.",
  form: {
    legend: "Khoảng thời gian (ngày theo giờ Việt Nam)",
    from: "Từ ngày",
    to: "Đến ngày",
    apply: "Xem chỉ số",
    hint: (days) => `Tối đa ${days} ngày, tính cả hai ngày đầu và cuối.`,
    invalid: "Khoảng thời gian không hợp lệ nên trang đang hiện khoảng mặc định.",
  },
  window: (from, to, days) => `Khoảng ${from} → ${to} (${days} ngày)`,
  generated: (at) => `Tính lúc ${at}`,
  activeMembers: (count) => `${count} thành viên hoạt động (pilot hoặc mùa giải, có ít nhất một lần nộp) tính đến cuối khoảng`,
  notYet: "Chưa tới",
  none: "—",
  noData: "Không có dữ liệu trong khoảng này.",
  columns: {
    period: "Kỳ",
    range: "Ngày",
    members: "Thành viên",
    rate: "Tỷ lệ",
    count: "Số lượng",
    cohort: "Nhóm",
    size: "Quy mô",
    reward: "Phần thưởng",
    remaining: "Còn lại",
    capacity: "Sức chứa",
    claims: "Yêu cầu trong khoảng",
    redeemed: "Đã nhận",
    held: "Đang giữ",
    step: "Bước",
    value: "Giá trị",
    code: "Mã lý do",
    median: "RP trung vị",
    p25: "Phân vị 25",
    p75: "Phân vị 75",
    max: "Cao nhất",
    scored: "Có điểm",
    signal: "Tín hiệu",
    reached: "Đã đạt",
    medianDays: "Số ngày trung vị",
    spread: "Nhanh nhất – chậm nhất",
    before: "Trước",
    after: "Sau",
    measure: "Chỉ số",
    unlimited: "Không giới hạn",
  },
  northStar: {
    title: "Chỉ số chính: tiến bộ được xác minh trong 90 ngày",
    basis: (days) =>
      `Thành viên có lần nộp đầu tiên trong khoảng này và có một sự kiện VALIDATE, BUILD hoặc SHIP được xác minh trong vòng ${days} ngày sau đó. Chỉ những ai đã đủ ${days} ngày mới được tính vào tỷ lệ.`,
    reached: "Đạt tiến bộ được xác minh",
    pending: (pending, early) => `${pending} thành viên vẫn đang trong khoảng 90 ngày đầu; ${early} người trong số đó đã đạt.`,
  },
  timeToFirst: {
    title: "Thời gian tới tín hiệu vấn đề và khách hàng đầu tiên",
    basis: "Thành viên có lần nộp đầu tiên trong khoảng này. Số ngày tính từ lần nộp đó đến lúc sự kiện phù hợp đầu tiên được xác minh.",
    signals: {
      problem_signal: "Tín hiệu vấn đề (validate_problem_signal)",
      customer_or_payment: "Người dùng thật hoặc khoản thanh toán đầu tiên",
    },
    days: (value) => `${value} ngày`,
  },
  activity: {
    title: "Tỷ lệ hoạt động có ý nghĩa",
    basis: "Thành viên hoạt động có ít nhất một sự kiện được xác minh trong kỳ, trên số thành viên đã bắt đầu trước khi kỳ kết thúc. Hiện 12 kỳ gần nhất trong khoảng.",
    weeks: "Theo tuần",
    months: "Theo tháng",
  },
  peerHelp: {
    title: "Kết quả hỗ trợ đồng đội",
    basis: "Các lần ghi nhận hỗ trợ đồng đội được tạo trong khoảng này, theo kết quả xử lý.",
    confirmedApproved: "Được người nhận hỗ trợ xác nhận và được duyệt",
    submitted: "Đã nộp",
    confirmed: "Đã xác nhận",
    approved: "Đã duyệt",
    rejected: "Bị từ chối",
    open: "Đang chờ",
    withdrawn: "Đã rút",
    helpers: "Thành viên đã hỗ trợ",
    helped: "Thành viên được hỗ trợ",
    reciprocal: "Cặp xác nhận chéo cho nhau",
    reciprocalHint: "Hai thành viên cùng xác nhận đã hỗ trợ lẫn nhau trong khoảng này. Chưa phải bằng chứng gian lận, nhưng nên xem lại.",
  },
  retention: {
    title: "Mức tham gia và giữ chân theo nhóm",
    basis: "Nhóm = tháng của lần nộp đầu tiên (trong khoảng này). Một thành viên được tính ở tháng sau nếu tháng đó họ có nộp bằng chứng.",
    offset: (n) => `Tháng +${n}`,
  },
  rewards: {
    title: "Yêu cầu nhận thưởng và tỷ lệ đã nhận",
    basis: "Yêu cầu được tạo trong khoảng này, theo trạng thái. Còn lại là số suất hiện có; sức chứa cộng thêm các suất đang được giữ và đã nhận.",
    total: "Đã nhận trên tổng yêu cầu trong khoảng",
    capacityUsed: "Đã nhận trên tổng sức chứa (phần thưởng có giới hạn, mọi thời điểm)",
    statuses: {
      requested: "Đã yêu cầu",
      approved: "Đã duyệt",
      rejected: "Bị từ chối",
      redeemed: "Đã nhận",
      expired: "Hết hạn",
      cancelled: "Đã huỷ",
    },
  },
  integrity: {
    title: "Từ chối, đảo điểm và khiếu nại",
    basis: "Bằng chứng được quyết định trong khoảng, bút toán sổ điểm được ghi trong khoảng, khiếu nại được mở trong khoảng.",
    rejection: "Bị từ chối trên tổng duyệt và từ chối",
    reversals: "Lần đảo điểm trên số lần cộng điểm",
    reversedRp: (rp) => `${rp} RP đã bị đảo`,
    reasonsTitle: "Lý do từ chối",
    appealsTitle: "Khiếu nại",
    appeals: { opened: "Đã mở", open: "Đang mở", upheld: "Giữ nguyên", overturned: "Đã đảo quyết định", withdrawn: "Đã rút" },
  },
  wrapped: {
    title: "Year in Review: hoàn thành, chia sẻ và chuyển đổi",
    basis: "Bản Year in Review và liên kết chia sẻ được tạo trong khoảng này, cùng lượt xem, đăng ký và gói trả phí được ghi nhận qua các liên kết đó trong khoảng.",
    completed: "Thành viên có Year in Review",
    shared: "Trong số đó, người đã chia sẻ",
    visits: "Lượt xem liên kết chia sẻ",
    signups: "Đăng ký trên mỗi lượt xem",
    paid: "Gói trả phí trên mỗi đăng ký",
  },
  distribution: {
    title: "Phân bố RP giữa các nhóm",
    basis: (days, share) =>
      `RP ròng kiếm được trong khoảng (đã trừ các lần đảo điểm) của thành viên hoạt động. Người mới bắt đầu trong vòng ${days} ngày trước cuối khoảng. Chuyên gia một giai đoạn có ít nhất ${Math.round(share * 100)}% RP từ một giai đoạn. Người đóng góp có RP CONTRIBUTE. So sánh trung vị để xem có nhóm builder nào bị bỏ lại không.`,
    cohorts: {
      all: "Tất cả thành viên hoạt động",
      newcomers: "Người mới",
      established: "Thành viên lâu năm",
      specialist_validate: "Chuyên VALIDATE",
      specialist_build: "Chuyên BUILD",
      specialist_ship: "Chuyên SHIP",
      specialist_contribute: "Chuyên CONTRIBUTE",
      contributors: "Người đóng góp",
    },
  },
  pilot: {
    title: "Đánh giá pilot: trước và sau khi tham gia",
    basis: (weeks) =>
      `Thành viên tham gia pilot hoặc một mùa giải trong khoảng này (tính mốc sớm hơn). Với mỗi người, sự kiện được xác minh trong ${weeks} tuần trước khi tham gia được so với ${weeks} tuần sau. Ai chưa đủ ${weeks} tuần sau thì chưa được tính.`,
    caveat:
      "Trước khi tham gia, thành viên chưa thể nộp bằng chứng, nên phía \"trước\" chỉ gồm bằng chứng ghi lùi ngày và dữ liệu nhập lại. Hãy xem đó là mức tối thiểu, không phải nhóm đối chứng.",
    summary: (enrolled, evaluated, pending) => `${enrolled} người tham gia trong khoảng · ${evaluated} đã đánh giá · ${pending} chưa đủ thời gian sau`,
    withEvent: "Thành viên có sự kiện được xác minh",
    events: "Sự kiện được xác minh",
    imported: "Trong đó nhập lại",
    mean: "Trung bình mỗi người",
    median: "Trung vị mỗi người",
    improved: "Nhiều sự kiện hơn sau khi tham gia",
    unchanged: "Không đổi",
    declined: "Ít sự kiện hơn sau khi tham gia",
  },
};

const COPY: Record<PageLocale, MetricsCopy> = { en, vi };

export function getMetricsCopy(locale: string): MetricsCopy {
  return COPY[toPageLocale(locale)];
}
