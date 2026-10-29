/**
 * UI copy for the NLB Live pages (/live and /live/<slug>), kept here (not messages/*.json) so the
 * feature ships self-contained, like `lib/courses/courses-copy.ts`. Every key exists in both locales
 * (enforced by `LiveCopy` and the copy-parity test).
 */
export type LiveLocale = "en" | "vi";

export interface LiveCopy {
  /** Masthead */
  title: string;
  description: string;
  plateName: string;
  headingLead: string;
  headingAccent: string;
  headingTail: string;
  navLabel: string;
  /** Next event hero */
  nextEventLabel: string;
  hostedBy: (host: string) => string;
  whenLabel: string;
  hostLabel: string;
  priceLabel: string;
  seatsLabel: string;
  statusLabel: string;
  seatsLeft: (left: number, capacity: number) => string;
  seatsLimited: (capacity: number) => string;
  seatsSoldOut: string;
  free: string;
  memberDiscount: string;
  status: Record<"scheduled" | "sales_open" | "live" | "ended" | "archived" | "cancelled", string>;
  viewEvent: string;
  noEventKicker: string;
  noEventTitle: string;
  noEventBody: string;
  /** CTA by state */
  signInToBuy: string;
  buyTicket: (price: string) => string;
  verifyEmailToBuy: string;
  salesNotOpen: string;
  soldOut: string;
  salesClosed: string;
  eventEnded: string;
  eventCancelled: string;
  ticketHeld: (time: string) => string;
  ticketException: string;
  youHaveTicket: string;
  paymentReturned: string;
  refresh: string;
  /** Consent step */
  consentTitle: string;
  consentIntro: (title: string, price: string) => string;
  recordingNoticeHeading: string;
  refundPolicyHeading: string;
  refundPolicyFallback: string;
  consentCheckbox: string;
  consentRequiredHint: string;
  continueToCheckout: string;
  redirecting: string;
  cancel: string;
  close: string;
  /** Join */
  joinChecking: string;
  joinButton: string;
  joinOpensAt: (time: string) => string;
  joinOpenUntil: (time: string) => string;
  joinNotReady: string;
  /** The host has not opened the meeting room yet. */
  joinMeetingNotReady: string;
  joinEnded: string;
  joinNoTicket: string;
  joinError: string;
  /** Join check answered 401: the session is gone. */
  joinSignIn: string;
  joinSignInButton: string;
  checkAgain: string;
  newTab: string;
  /** Weekly vote */
  voteLabel: string;
  voteHeading: string;
  voteIntro: string;
  voteLegend: string;
  voteSubmit: string;
  voteChange: string;
  voteSaving: string;
  voteSaved: string;
  voteChanged: string;
  yourVote: string;
  closesAt: (time: string) => string;
  opensAt: (time: string) => string;
  closedAt: (time: string) => string;
  timeLeft: (parts: { days: number; hours: number; minutes: number }) => string;
  roundStatus: Record<"scheduled" | "open" | "closed" | "finalized", string>;
  signInToVote: string;
  signInToVoteBody: string;
  verifyEmailToVote: string;
  votesHidden: string;
  resultsPending: string;
  totalVotes: (n: number) => string;
  votes: (n: number) => string;
  winner: string;
  noRoundKicker: string;
  noRoundTitle: string;
  noRoundBody: string;
  ungrouped: string;
  /** Lists */
  upcomingLabel: string;
  upcomingHeading: string;
  upcomingEmpty: string;
  pastLabel: string;
  pastHeading: string;
  pastEmpty: string;
  replayComing: string;
  /** Detail page */
  back: string;
  detailPlate: string;
  aboutEvent: string;
  /** Errors from the member API, by stable code */
  errors: Record<LiveUiErrorCode, string>;
}

/** Error codes the Live member endpoints can answer with (plus local fallbacks). */
export type LiveUiErrorCode =
  | "unauthenticated"
  | "email_unverified"
  | "banned"
  | "forbidden"
  | "rate_limited"
  | "round_not_open"
  | "topic_not_in_round"
  | "not_found"
  | "sold_out"
  | "sales_not_open"
  | "already_ticketed"
  | "recording_consent_required"
  | "checkout_failed"
  | "network"
  | "unknown";

const en: LiveCopy = {
  title: "NLB Live",
  description: "Weekly live build sessions. Vote on next week's topic, buy a seat, and join from your browser.",
  plateName: "Transmission",
  headingLead: "Build together, ",
  headingAccent: "live",
  headingTail: ", every week.",
  navLabel: "Live",
  nextEventLabel: "Next session",
  hostedBy: (host) => `Hosted by ${host}`,
  whenLabel: "When",
  hostLabel: "Host",
  priceLabel: "Seat",
  seatsLabel: "Seats",
  statusLabel: "Status",
  seatsLeft: (left, capacity) => `${left} of ${capacity} left`,
  seatsLimited: (capacity) => `Limited to ${capacity} seats`,
  seatsSoldOut: "Sold out",
  free: "Free",
  memberDiscount: "Member discount at checkout",
  status: {
    scheduled: "Scheduled",
    sales_open: "On sale",
    live: "Live now",
    ended: "Ended",
    archived: "Ended",
    cancelled: "Cancelled",
  },
  viewEvent: "Event details",
  noEventKicker: "No transmission scheduled",
  noEventTitle: "The next session is still being planned.",
  noEventBody: "Vote on the topic below. The winning topic becomes the next live session, and seats go on sale here.",
  signInToBuy: "Sign in to buy a seat",
  buyTicket: (price) => `Buy a seat · ${price}`,
  verifyEmailToBuy: "Verify your email address to buy a seat. Check your inbox for the verification link.",
  salesNotOpen: "Seats go on sale soon.",
  soldOut: "All seats are taken.",
  salesClosed: "Seat sales have closed for this session.",
  eventEnded: "This session has ended.",
  eventCancelled: "This session was cancelled. Ticket holders are refunded through Polar.",
  ticketHeld: (time) => `Your seat is held until ${time}. Finish checkout to keep it.`,
  ticketException: "We received your payment but could not assign a seat. Our team will contact you to sort it out or refund you.",
  youHaveTicket: "You have a ticket",
  paymentReturned: "Payment received. Your ticket appears as soon as Polar confirms the order, usually within a minute.",
  refresh: "Refresh",
  consentTitle: "Before you buy",
  consentIntro: (title, price) => `One seat for “${title}” at ${price}. Please read and accept the terms below.`,
  recordingNoticeHeading: "Recording",
  refundPolicyHeading: "Refunds",
  refundPolicyFallback: "Refunds follow the NLB refund policy.",
  consentCheckbox: "I understand the session is recorded and the replay may be sold later, and I accept the refund policy.",
  consentRequiredHint: "Tick the box to continue.",
  continueToCheckout: "Continue to Polar checkout",
  redirecting: "Opening checkout…",
  cancel: "Cancel",
  close: "Close",
  joinChecking: "Checking your access…",
  joinButton: "Join the session",
  joinOpensAt: (time) => `The join button opens at ${time}, 15 minutes before the start.`,
  joinOpenUntil: (time) => `Open until ${time}.`,
  joinNotReady: "The meeting link is not ready yet. Check again in a few minutes.",
  joinMeetingNotReady: "The host has not opened the meeting room yet. Check again in a few minutes.",
  joinEnded: "This session has ended. The replay will come to Courses.",
  joinNoTicket: "We could not find an active ticket for your account.",
  joinError: "We could not check your access. Please try again.",
  joinSignIn: "Sign in again to get your join link.",
  joinSignInButton: "Sign in",
  checkAgain: "Check again",
  newTab: "(opens in a new tab)",
  voteLabel: "Weekly vote",
  voteHeading: "Choose next week's topic",
  voteIntro: "One vote per member each week. You can change it until voting closes.",
  voteLegend: "Topics",
  voteSubmit: "Cast vote",
  voteChange: "Change vote",
  voteSaving: "Saving your vote…",
  voteSaved: "Vote saved.",
  voteChanged: "Vote changed.",
  yourVote: "Your vote",
  closesAt: (time) => `Voting closes ${time}`,
  opensAt: (time) => `Voting opens ${time}`,
  closedAt: (time) => `Voting closed ${time}`,
  timeLeft: ({ days, hours, minutes }) =>
    days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`,
  roundStatus: { scheduled: "Opens soon", open: "Voting open", closed: "Counting", finalized: "Final" },
  signInToVote: "Sign in to vote",
  signInToVoteBody: "Voting is free for every member account.",
  verifyEmailToVote: "Verify your email address to vote. Check your inbox for the verification link.",
  votesHidden: "Counts stay hidden until voting closes, so early votes do not steer later ones.",
  resultsPending: "Voting has closed. Results are final once the team confirms them.",
  totalVotes: (n) => `${n} ${n === 1 ? "vote" : "votes"} in total`,
  votes: (n) => `${n} ${n === 1 ? "vote" : "votes"}`,
  winner: "Winner",
  noRoundKicker: "No vote this week",
  noRoundTitle: "The next vote opens soon.",
  noRoundBody: "Each week members choose the topic for the next live session. Check back when the next round opens.",
  ungrouped: "Other topics",
  upcomingLabel: "Schedule",
  upcomingHeading: "Upcoming sessions",
  upcomingEmpty: "No other sessions scheduled yet.",
  pastLabel: "Archive",
  pastHeading: "Previous sessions",
  pastEmpty: "No sessions have aired yet.",
  replayComing: "Replay coming to Courses",
  back: "All sessions",
  detailPlate: "Transmission",
  aboutEvent: "About this session",
  errors: {
    unauthenticated: "Your session has expired. Sign in and try again.",
    email_unverified: "Verify your email address first. Check your inbox for the verification link.",
    banned: "This account cannot take part right now.",
    forbidden: "This account cannot do that right now.",
    rate_limited: "Too many attempts. Wait a minute and try again.",
    round_not_open: "Voting is not open right now.",
    topic_not_in_round: "That topic is not part of this week's vote. Refresh the page and choose again.",
    not_found: "This item is no longer available. Refresh the page.",
    sold_out: "All seats are taken.",
    sales_not_open: "Seat sales are not open for this session.",
    already_ticketed: "You already have a ticket for this session.",
    recording_consent_required: "Please accept the recording and refund terms to continue.",
    checkout_failed: "We could not start checkout. Please try again.",
    network: "Network error. Check your connection and try again.",
    unknown: "Something went wrong. Please try again.",
  },
};

const vi: LiveCopy = {
  title: "NLB Live",
  description: "Các buổi build trực tiếp hằng tuần. Bình chọn chủ đề tuần sau, mua chỗ và tham gia ngay trên trình duyệt.",
  plateName: "Phát sóng",
  headingLead: "Cùng nhau build ",
  headingAccent: "trực tiếp",
  headingTail: " mỗi tuần.",
  navLabel: "Live",
  nextEventLabel: "Buổi tiếp theo",
  hostedBy: (host) => `Dẫn dắt bởi ${host}`,
  whenLabel: "Thời gian",
  hostLabel: "Người dẫn",
  priceLabel: "Giá chỗ",
  seatsLabel: "Số chỗ",
  statusLabel: "Trạng thái",
  seatsLeft: (left, capacity) => `Còn ${left}/${capacity} chỗ`,
  seatsLimited: (capacity) => `Giới hạn ${capacity} chỗ`,
  seatsSoldOut: "Hết chỗ",
  free: "Miễn phí",
  memberDiscount: "Thành viên được giảm giá khi thanh toán",
  status: {
    scheduled: "Đã lên lịch",
    sales_open: "Đang mở bán",
    live: "Đang diễn ra",
    ended: "Đã kết thúc",
    archived: "Đã kết thúc",
    cancelled: "Đã huỷ",
  },
  viewEvent: "Chi tiết buổi live",
  noEventKicker: "Chưa có lịch phát sóng",
  noEventTitle: "Buổi tiếp theo vẫn đang được lên kế hoạch.",
  noEventBody: "Hãy bình chọn chủ đề bên dưới. Chủ đề thắng sẽ thành buổi live tiếp theo, và vé sẽ được mở bán ngay tại đây.",
  signInToBuy: "Đăng nhập để mua chỗ",
  buyTicket: (price) => `Mua chỗ · ${price}`,
  verifyEmailToBuy: "Hãy xác minh email để mua chỗ. Đường dẫn xác minh đã được gửi vào hộp thư của bạn.",
  salesNotOpen: "Vé sẽ sớm được mở bán.",
  soldOut: "Đã hết chỗ.",
  salesClosed: "Buổi này đã ngừng bán vé.",
  eventEnded: "Buổi này đã kết thúc.",
  eventCancelled: "Buổi này đã bị huỷ. Người đã mua vé sẽ được hoàn tiền qua Polar.",
  ticketHeld: (time) => `Chỗ của bạn được giữ đến ${time}. Hãy hoàn tất thanh toán để giữ chỗ.`,
  ticketException: "Chúng tôi đã nhận thanh toán nhưng chưa xếp được chỗ cho bạn. Đội ngũ NLB sẽ liên hệ để xử lý hoặc hoàn tiền.",
  youHaveTicket: "Bạn đã có vé",
  paymentReturned: "Đã nhận thanh toán. Vé sẽ hiện ra ngay khi Polar xác nhận đơn hàng, thường trong vòng một phút.",
  refresh: "Tải lại",
  consentTitle: "Trước khi mua",
  consentIntro: (title, price) => `Một chỗ cho buổi “${title}” với giá ${price}. Vui lòng đọc và đồng ý với các điều khoản bên dưới.`,
  recordingNoticeHeading: "Ghi hình",
  refundPolicyHeading: "Hoàn tiền",
  refundPolicyFallback: "Việc hoàn tiền tuân theo chính sách hoàn tiền của NLB.",
  consentCheckbox: "Tôi hiểu buổi live sẽ được ghi hình và bản ghi có thể được bán sau, đồng thời đồng ý với chính sách hoàn tiền.",
  consentRequiredHint: "Đánh dấu ô xác nhận để tiếp tục.",
  continueToCheckout: "Tiếp tục thanh toán qua Polar",
  redirecting: "Đang mở trang thanh toán…",
  cancel: "Huỷ",
  close: "Đóng",
  joinChecking: "Đang kiểm tra quyền tham gia…",
  joinButton: "Vào buổi live",
  joinOpensAt: (time) => `Nút tham gia sẽ mở lúc ${time}, 15 phút trước giờ bắt đầu.`,
  joinOpenUntil: (time) => `Mở đến ${time}.`,
  joinNotReady: "Đường dẫn phòng họp chưa sẵn sàng. Vui lòng kiểm tra lại sau vài phút.",
  joinMeetingNotReady: "Người dẫn chưa mở phòng họp. Vui lòng kiểm tra lại sau vài phút.",
  joinEnded: "Buổi này đã kết thúc. Bản ghi sẽ có trong mục Khoá học.",
  joinNoTicket: "Không tìm thấy vé còn hiệu lực cho tài khoản của bạn.",
  joinError: "Không thể kiểm tra quyền tham gia. Vui lòng thử lại.",
  joinSignIn: "Hãy đăng nhập lại để lấy đường dẫn tham gia.",
  joinSignInButton: "Đăng nhập",
  checkAgain: "Kiểm tra lại",
  newTab: "(mở trong thẻ mới)",
  voteLabel: "Bình chọn hằng tuần",
  voteHeading: "Chọn chủ đề cho tuần sau",
  voteIntro: "Mỗi thành viên có một phiếu mỗi tuần và có thể đổi lựa chọn cho đến khi bình chọn kết thúc.",
  voteLegend: "Chủ đề",
  voteSubmit: "Bình chọn",
  voteChange: "Đổi lựa chọn",
  voteSaving: "Đang lưu phiếu bầu…",
  voteSaved: "Đã lưu phiếu bầu.",
  voteChanged: "Đã đổi lựa chọn.",
  yourVote: "Lựa chọn của bạn",
  closesAt: (time) => `Kết thúc bình chọn lúc ${time}`,
  opensAt: (time) => `Mở bình chọn lúc ${time}`,
  closedAt: (time) => `Đã kết thúc bình chọn lúc ${time}`,
  timeLeft: ({ days, hours, minutes }) =>
    days > 0 ? `còn ${days} ngày ${hours} giờ` : hours > 0 ? `còn ${hours} giờ ${minutes} phút` : `còn ${minutes} phút`,
  roundStatus: { scheduled: "Sắp mở", open: "Đang bình chọn", closed: "Đang kiểm phiếu", finalized: "Kết quả chính thức" },
  signInToVote: "Đăng nhập để bình chọn",
  signInToVoteBody: "Mọi tài khoản thành viên đều được bình chọn miễn phí.",
  verifyEmailToVote: "Hãy xác minh email để bình chọn. Đường dẫn xác minh đã được gửi vào hộp thư của bạn.",
  votesHidden: "Số phiếu được ẩn cho đến khi bình chọn kết thúc, để phiếu bầu sớm không ảnh hưởng đến người đến sau.",
  resultsPending: "Bình chọn đã kết thúc. Kết quả sẽ là chính thức khi đội ngũ NLB xác nhận.",
  totalVotes: (n) => `Tổng cộng ${n} phiếu`,
  votes: (n) => `${n} phiếu`,
  winner: "Chủ đề thắng",
  noRoundKicker: "Tuần này chưa có bình chọn",
  noRoundTitle: "Vòng bình chọn tiếp theo sẽ sớm mở.",
  noRoundBody: "Mỗi tuần, thành viên chọn chủ đề cho buổi live kế tiếp. Hãy quay lại khi vòng mới bắt đầu.",
  ungrouped: "Chủ đề khác",
  upcomingLabel: "Lịch phát sóng",
  upcomingHeading: "Các buổi sắp tới",
  upcomingEmpty: "Chưa có buổi nào khác được lên lịch.",
  pastLabel: "Lưu trữ",
  pastHeading: "Các buổi trước",
  pastEmpty: "Chưa có buổi nào được phát sóng.",
  replayComing: "Bản ghi sắp có trong Khoá học",
  back: "Tất cả các buổi",
  detailPlate: "Phát sóng",
  aboutEvent: "Về buổi live này",
  errors: {
    unauthenticated: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập và thử lại.",
    email_unverified: "Hãy xác minh email trước. Đường dẫn xác minh đã được gửi vào hộp thư của bạn.",
    banned: "Tài khoản này hiện không thể tham gia.",
    forbidden: "Tài khoản này hiện không thể thực hiện thao tác đó.",
    rate_limited: "Bạn thao tác quá nhanh. Vui lòng đợi một phút rồi thử lại.",
    round_not_open: "Hiện không trong thời gian bình chọn.",
    topic_not_in_round: "Chủ đề này không thuộc vòng bình chọn tuần này. Hãy tải lại trang và chọn lại.",
    not_found: "Mục này không còn khả dụng. Vui lòng tải lại trang.",
    sold_out: "Đã hết chỗ.",
    sales_not_open: "Buổi này hiện chưa mở bán vé.",
    already_ticketed: "Bạn đã có vé cho buổi này.",
    recording_consent_required: "Vui lòng đồng ý với điều khoản ghi hình và hoàn tiền để tiếp tục.",
    checkout_failed: "Không thể bắt đầu thanh toán. Vui lòng thử lại.",
    network: "Lỗi kết nối mạng. Vui lòng kiểm tra kết nối rồi thử lại.",
    unknown: "Đã có lỗi xảy ra. Vui lòng thử lại.",
  },
};

const COPY: Record<LiveLocale, LiveCopy> = { en, vi };

/** Copy for both locales, exported for the parity test. */
export const LIVE_COPY: Readonly<Record<LiveLocale, LiveCopy>> = COPY;

export function toLiveLocale(locale: string): LiveLocale {
  return locale === "vi" ? "vi" : "en";
}

export function getLiveCopy(locale: string): LiveCopy {
  return COPY[toLiveLocale(locale)];
}
